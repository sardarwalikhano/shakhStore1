create table public.store_moderation_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_status text not null check (previous_status in ('active', 'suspended')),
  new_status text not null check (new_status in ('active', 'suspended')),
  note text not null check (char_length(note) between 2 and 1200),
  created_at timestamptz not null default now(),
  constraint store_moderation_events_status_change
    check (previous_status <> new_status)
);

create index store_moderation_events_store_created_idx
  on public.store_moderation_events (store_id, created_at desc);
create index store_moderation_events_actor_created_idx
  on public.store_moderation_events (actor_id, created_at desc);

alter table public.store_moderation_events enable row level security;
create policy store_moderation_events_select_admin
on public.store_moderation_events for select to authenticated
using (public.current_app_role() in ('admin', 'super_admin'));

revoke all privileges on public.store_moderation_events from anon, authenticated;
grant select on public.store_moderation_events to authenticated;
grant all privileges on public.store_moderation_events to service_role;

create or replace function public.moderate_merchant_store(
  p_store_id uuid,
  p_actor_id uuid,
  p_new_status text,
  p_note text
)
returns table (store_id uuid, previous_status text, new_status text)
language plpgsql
set search_path = ''
as $function$
declare
  v_store public.stores%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_new_status not in ('active', 'suspended') then
    raise exception 'invalid_store_moderation_status' using errcode = '22023';
  end if;
  if char_length(v_note) < 2 or char_length(v_note) > 1200 then
    raise exception 'invalid_store_moderation_note' using errcode = '22023';
  end if;

  select * into v_store
  from public.stores
  where id = p_store_id and is_platform_store = false
  for update;

  if not found then
    raise exception 'merchant_store_not_found' using errcode = 'P0002';
  end if;
  if v_store.status not in ('active', 'suspended') then
    raise exception 'merchant_store_not_moderatable' using errcode = 'P0001';
  end if;
  if v_store.status = p_new_status then
    raise exception 'merchant_store_already_in_target_status' using errcode = 'P0001';
  end if;

  update public.stores set status = p_new_status where id = p_store_id;
  insert into public.store_moderation_events (
    store_id, actor_id, previous_status, new_status, note
  ) values (
    p_store_id, p_actor_id, v_store.status, p_new_status, v_note
  );

  return query select p_store_id, v_store.status, p_new_status;
end;
$function$;

revoke all on function public.moderate_merchant_store(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.moderate_merchant_store(uuid, uuid, text, text)
  to service_role;

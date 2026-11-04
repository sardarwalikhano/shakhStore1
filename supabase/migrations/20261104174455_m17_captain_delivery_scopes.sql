-- M17: global and zone-scoped delivery captain access.
-- Existing captain accounts retain their historical behavior as global captains.
create table public.captain_delivery_scopes (
  captain_user_id uuid primary key references auth.users(id) on delete cascade,
  scope_type text not null check (scope_type in ('global', 'zones')),
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.captain_delivery_scope_zones (
  captain_user_id uuid not null references public.captain_delivery_scopes(captain_user_id) on delete cascade,
  zone_id uuid not null references public.delivery_zones(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (captain_user_id, zone_id)
);

create index captain_delivery_scope_zones_zone_idx
  on public.captain_delivery_scope_zones(zone_id, captain_user_id);

alter table public.captain_delivery_scopes enable row level security;
alter table public.captain_delivery_scope_zones enable row level security;

revoke all privileges on public.captain_delivery_scopes, public.captain_delivery_scope_zones
  from anon, authenticated;
grant all privileges on public.captain_delivery_scopes, public.captain_delivery_scope_zones
  to service_role;

insert into public.captain_delivery_scopes (captain_user_id, scope_type, is_active)
select u.id, 'global', true
from auth.users u
where u.raw_app_meta_data ->> 'role' = 'captain'
on conflict (captain_user_id) do nothing;

create or replace function private.admin_list_captain_scopes_v1()
returns table (
  user_id uuid,
  full_name text,
  email text,
  scope_type text,
  is_active boolean,
  zone_ids uuid[],
  email_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.current_app_role();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role is null or v_role not in ('admin', 'super_admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    coalesce(
      nullif(pg_catalog.btrim(p.full_name), ''),
      nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      u.email::text,
      'کاپتن'
    ),
    u.email::text,
    coalesce(s.scope_type, 'zones'),
    coalesce(s.is_active, false),
    coalesce(
      pg_catalog.array_agg(distinct cz.zone_id) filter (where cz.zone_id is not null),
      array[]::uuid[]
    ),
    (u.email_confirmed_at is not null)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.captain_delivery_scopes s on s.captain_user_id = u.id
  left join public.captain_delivery_scope_zones cz on cz.captain_user_id = u.id
  where u.raw_app_meta_data ->> 'role' = 'captain'
  group by u.id, p.full_name, u.raw_user_meta_data, u.email,
           u.email_confirmed_at, s.scope_type, s.is_active
  order by coalesce(
    nullif(pg_catalog.btrim(p.full_name), ''),
    nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    u.email::text,
    'کاپتن'
  ), u.id;
end;
$function$;

create or replace function private.admin_manage_captain_scope_v1(
  p_captain_user_id uuid,
  p_scope_type text,
  p_zone_ids uuid[],
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_role text := public.current_app_role();
  v_zone_ids uuid[] := coalesce(p_zone_ids, array[]::uuid[]);
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role is distinct from 'super_admin' then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_captain_user_id is null then
    raise exception 'CAPTAIN_REQUIRED' using errcode = '22023';
  end if;
  if p_scope_type is null or p_scope_type not in ('global', 'zones') then
    raise exception 'INVALID_CAPTAIN_SCOPE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = p_captain_user_id
      and u.raw_app_meta_data ->> 'role' = 'captain'
  ) then
    raise exception 'TARGET_USER_IS_NOT_CAPTAIN' using errcode = '22023';
  end if;

  if p_scope_type = 'global' and pg_catalog.cardinality(v_zone_ids) <> 0 then
    raise exception 'GLOBAL_SCOPE_CANNOT_HAVE_ZONE_IDS' using errcode = '22023';
  end if;
  if p_scope_type = 'zones' and pg_catalog.cardinality(v_zone_ids) = 0 then
    raise exception 'CAPTAIN_ZONE_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(v_zone_ids) as requested(zone_id)
    group by requested.zone_id
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_CAPTAIN_ZONE' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(v_zone_ids) as requested(zone_id)
    left join public.delivery_zones z on z.id = requested.zone_id
    where requested.zone_id is null or z.id is null
  ) then
    raise exception 'CAPTAIN_ZONE_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.captain_delivery_scopes (
    captain_user_id, scope_type, is_active, created_by_user_id
  )
  values (
    p_captain_user_id, p_scope_type, coalesce(p_is_active, false), v_actor_id
  )
  on conflict (captain_user_id) do update
  set scope_type = excluded.scope_type,
      is_active = excluded.is_active,
      updated_at = pg_catalog.now();

  delete from public.captain_delivery_scope_zones
  where captain_user_id = p_captain_user_id;

  if p_scope_type = 'zones' then
    insert into public.captain_delivery_scope_zones (captain_user_id, zone_id)
    select p_captain_user_id, requested.zone_id
    from pg_catalog.unnest(v_zone_ids) as requested(zone_id);
  end if;

  return pg_catalog.jsonb_build_object(
    'captain_user_id', p_captain_user_id,
    'scope_type', p_scope_type,
    'zone_ids', v_zone_ids,
    'is_active', coalesce(p_is_active, false)
  );
end;
$function$;

create or replace function private.enforce_delivery_captain_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_scope_type text;
  v_scope_active boolean;
  v_order_zone_id uuid;
begin
  if new.captain_user_id is null then
    return new;
  end if;

  select s.scope_type, s.is_active
  into v_scope_type, v_scope_active
  from public.captain_delivery_scopes s
  join auth.users u on u.id = s.captain_user_id
  where s.captain_user_id = new.captain_user_id
    and u.raw_app_meta_data ->> 'role' = 'captain';

  if not found then
    raise exception 'CAPTAIN_SCOPE_NOT_CONFIGURED' using errcode = '42501';
  end if;
  if not coalesce(v_scope_active, false) then
    raise exception 'CAPTAIN_SCOPE_INACTIVE' using errcode = '42501';
  end if;

  select o.delivery_zone_id
  into v_order_zone_id
  from public.orders o
  where o.id = new.order_id;

  if not found or v_order_zone_id is null then
    raise exception 'ORDER_DELIVERY_ZONE_REQUIRED' using errcode = '23514';
  end if;

  if v_scope_type = 'zones' and not exists (
    select 1
    from public.captain_delivery_scope_zones cz
    where cz.captain_user_id = new.captain_user_id
      and cz.zone_id = v_order_zone_id
  ) then
    raise exception 'CAPTAIN_OUTSIDE_ASSIGNED_ZONES' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists delivery_assignments_enforce_captain_scope
  on public.delivery_assignments;
create trigger delivery_assignments_enforce_captain_scope
before insert or update of captain_user_id on public.delivery_assignments
for each row execute function private.enforce_delivery_captain_scope_v1();

revoke all on function private.admin_list_captain_scopes_v1()
  from public, anon, authenticated;
revoke all on function private.admin_manage_captain_scope_v1(uuid, text, uuid[], boolean)
  from public, anon, authenticated;
revoke all on function private.enforce_delivery_captain_scope_v1()
  from public, anon, authenticated;

grant execute on function private.admin_list_captain_scopes_v1()
  to authenticated;
grant execute on function private.admin_manage_captain_scope_v1(uuid, text, uuid[], boolean)
  to authenticated;

create or replace function public.admin_list_captain_scopes_v1()
returns table (
  user_id uuid,
  full_name text,
  email text,
  scope_type text,
  is_active boolean,
  zone_ids uuid[],
  email_confirmed boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.admin_list_captain_scopes_v1();
$function$;

create or replace function public.admin_manage_captain_scope_v1(
  p_captain_user_id uuid,
  p_scope_type text,
  p_zone_ids uuid[],
  p_is_active boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.admin_manage_captain_scope_v1(
    p_captain_user_id, p_scope_type, p_zone_ids, p_is_active
  );
$function$;

revoke all on function public.admin_list_captain_scopes_v1()
  from public, anon;
revoke all on function public.admin_manage_captain_scope_v1(uuid, text, uuid[], boolean)
  from public, anon;

grant execute on function public.admin_list_captain_scopes_v1()
  to authenticated;
grant execute on function public.admin_manage_captain_scope_v1(uuid, text, uuid[], boolean)
  to authenticated;

comment on table public.captain_delivery_scopes is
  'Trusted delivery-captain scope: global or restricted to explicitly linked delivery zones.';
comment on table public.captain_delivery_scope_zones is
  'Zone memberships for zone-scoped delivery captains; client reads and writes are RPC-only.';

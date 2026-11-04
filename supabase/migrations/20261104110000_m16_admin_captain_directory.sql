-- M16: admin-only directory of verified, active captain accounts for assignment UI.
create or replace function private.admin_list_available_captains_v1()
returns table(user_id uuid, full_name text, email text)
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
    coalesce(nullif(pg_catalog.btrim(p.full_name), ''), nullif(u.email, ''), 'کاپتن'),
    u.email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.raw_app_meta_data ->> 'role' = 'captain'
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until < pg_catalog.now())
  order by coalesce(nullif(pg_catalog.btrim(p.full_name), ''), nullif(u.email, ''), 'کاپتن'), u.id;
end;
$function$;

revoke all on function private.admin_list_available_captains_v1() from public, anon, authenticated;
grant execute on function private.admin_list_available_captains_v1() to authenticated;

create or replace function public.admin_list_available_captains_v1()
returns table(user_id uuid, full_name text, email text)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.admin_list_available_captains_v1();
$function$;

revoke all on function public.admin_list_available_captains_v1() from public, anon;
grant execute on function public.admin_list_available_captains_v1() to authenticated;

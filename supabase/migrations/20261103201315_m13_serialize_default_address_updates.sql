create or replace function private.set_default_customer_address_v1(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Serialize default-address changes for this user so concurrent requests
  -- cannot race the unique partial index that enforces one active default.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':default-address', 0)
  );

  perform 1
  from public.customer_addresses a
  where a.id = p_address_id
    and a.customer_id = v_user_id
    and a.is_active = true
  for update;

  if not found then
    raise exception 'ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.customer_addresses
  set is_default = false,
      updated_at = now()
  where customer_id = v_user_id
    and is_default = true
    and is_active = true
    and id <> p_address_id;

  update public.customer_addresses
  set is_default = true,
      updated_at = now()
  where id = p_address_id
    and customer_id = v_user_id
    and is_active = true;
end;
$function$;

-- M18: guarded per-store delivery fee administration.
-- Checkout integration and wallet settlement remain separate follow-up work.
create or replace function public.admin_set_store_delivery_fee_v1(
  p_store_id uuid,
  p_delivery_fee_iqd bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := public.current_app_role();
  v_store public.stores%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role is null or v_role not in ('admin', 'super_admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_store_id is null or p_delivery_fee_iqd is null
     or p_delivery_fee_iqd < 0 or p_delivery_fee_iqd > 100000000 then
    raise exception 'INVALID_STORE_DELIVERY_FEE' using errcode = '22023';
  end if;

  update public.stores
  set delivery_fee_iqd = p_delivery_fee_iqd,
      updated_at = pg_catalog.now()
  where id = p_store_id
    and is_platform_store is not true
  returning * into v_store;

  if not found then
    raise exception 'MERCHANT_STORE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'store_id', v_store.id,
    'delivery_fee_iqd', v_store.delivery_fee_iqd
  );
end;
$function$;

revoke all on function public.admin_set_store_delivery_fee_v1(uuid,bigint) from public, anon;
grant execute on function public.admin_set_store_delivery_fee_v1(uuid,bigint) to authenticated;

-- M19: expose a captain-scoped COD quote without leaking other consignments.
create or replace function public.captain_get_cod_collection_quote_v1(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment public.delivery_assignments%rowtype;
  v_order public.orders%rowtype;
  v_order_store public.order_stores%rowtype;
  v_delivery_share bigint := 0;
  v_expected_cash bigint := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if public.current_app_role() is distinct from 'captain' then
    raise exception 'CAPTAIN_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select da.* into v_assignment
  from public.delivery_assignments da
  where da.id = p_assignment_id
  for share;

  if not found then
    raise exception 'DELIVERY_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_assignment.captain_user_id is distinct from v_user_id then
    raise exception 'DELIVERY_NOT_ASSIGNED_TO_CAPTAIN' using errcode = '42501';
  end if;
  if v_assignment.cod_transaction_id is not null then
    return pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment.id,
      'expected_cash_iqd', v_assignment.cod_collected_iqd,
      'collected_at', v_assignment.cod_collected_at,
      'already_collected', true
    );
  end if;
  if v_assignment.status <> 'delivered' then
    raise exception 'DELIVERY_MUST_BE_DELIVERED_BEFORE_COD_COLLECTION' using errcode = 'P0001';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = v_assignment.order_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order.payment_method <> 'cash_on_delivery' or v_order.payment_status <> 'pending' then
    raise exception 'ORDER_NOT_ELIGIBLE_FOR_COD_COLLECTION' using errcode = 'P0001';
  end if;

  select os.* into v_order_store
  from public.order_stores os
  where os.id = v_assignment.order_store_id
    and os.order_id = v_order.id;

  if not found then
    raise exception 'ORDER_STORE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select allocation.delivery_share_iqd
  into v_delivery_share
  from (
    select
      os.id,
      case
        when row_number() over (order by os.created_at, os.id) = count(*) over () then
          v_order.delivery_fee_iqd - coalesce(
            sum(
              case
                when v_order.items_subtotal_iqd > 0 then
                  round(v_order.delivery_fee_iqd::numeric * os.items_subtotal_iqd / v_order.items_subtotal_iqd)::bigint
                else 0
              end
            ) over (
              order by os.created_at, os.id
              rows between unbounded preceding and 1 preceding
            ),
            0
          )
        when v_order.items_subtotal_iqd > 0 then
          round(v_order.delivery_fee_iqd::numeric * os.items_subtotal_iqd / v_order.items_subtotal_iqd)::bigint
        else 0
      end as delivery_share_iqd
    from public.order_stores os
    where os.order_id = v_order.id
  ) allocation
  where allocation.id = v_order_store.id;

  v_delivery_share := coalesce(v_delivery_share, 0);
  v_expected_cash := v_order_store.items_subtotal_iqd + v_delivery_share;

  return pg_catalog.jsonb_build_object(
    'assignment_id', v_assignment.id,
    'expected_cash_iqd', v_expected_cash,
    'goods_subtotal_iqd', v_order_store.items_subtotal_iqd,
    'delivery_fee_share_iqd', v_delivery_share,
    'already_collected', false
  );
end;
$$;

revoke all on function public.captain_get_cod_collection_quote_v1(uuid) from public, anon;
grant execute on function public.captain_get_cod_collection_quote_v1(uuid) to authenticated;

comment on function public.captain_get_cod_collection_quote_v1(uuid) is
  'Returns only the authenticated captain own delivered consignment COD amount; underlying multi-store allocation remains database-side.';

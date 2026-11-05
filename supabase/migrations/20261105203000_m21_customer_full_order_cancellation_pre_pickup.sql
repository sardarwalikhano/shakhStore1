-- M21: allow customers to cancel the complete order before any consignment is picked up.
-- Inventory is restored atomically; no wallet or payment ledger entries are created.

create or replace function public.customer_cancel_order_before_pickup_v1(
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_note text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_reason, '')), 500), '');
  v_store record;
  v_cancelled_assignments integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if public.current_app_role() is distinct from 'customer' then
    raise exception 'CUSTOMER_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'ORDER_ID_REQUIRED' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id = v_user_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status = 'cancelled' then
    return pg_catalog.jsonb_build_object(
      'order_id', v_order.id,
      'status', 'cancelled',
      'idempotent_replay', true
    );
  end if;

  if v_order.payment_method <> 'cash_on_delivery' or v_order.payment_status <> 'pending' then
    raise exception 'ORDER_NOT_ELIGIBLE_FOR_CUSTOMER_CANCELLATION' using errcode = 'P0001';
  end if;

  if v_order.status in ('delivered', 'refunded', 'refund_requested', 'payment_failed') then
    raise exception 'ORDER_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  -- Lock every consignment before checking its delivery and COD state.
  perform da.id
  from public.delivery_assignments da
  where da.order_id = v_order.id
  order by da.id
  for update;

  if exists (
    select 1
    from public.delivery_assignments da
    where da.order_id = v_order.id
      and (
        da.status in ('picked_up', 'on_the_way', 'delivered')
        or da.picked_up_at is not null
        or da.delivered_at is not null
        or da.cod_collected_at is not null
        or da.cod_transaction_id is not null
      )
  ) then
    raise exception 'ORDER_ALREADY_PICKED_UP_OR_COLLECTED' using errcode = 'P0001';
  end if;

  -- Lock all store-order rows and reject inconsistent terminal states.
  perform os.id
  from public.order_stores os
  where os.order_id = v_order.id
  order by os.id
  for update;

  if not exists (select 1 from public.order_stores os where os.order_id = v_order.id) then
    raise exception 'ORDER_HAS_NO_STORE_CONSIGNMENTS' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.order_stores os
    where os.order_id = v_order.id
      and os.status in ('picked_up', 'delivered', 'cancelled')
  ) then
    raise exception 'ORDER_CONSIGNMENT_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  -- Return reserved stock only for products that still use finite inventory.
  update public.products p
  set stock_quantity = p.stock_quantity + stock.quantity_to_restore,
      updated_at = pg_catalog.now()
  from (
    select oi.product_id, sum(oi.quantity)::numeric as quantity_to_restore
    from public.order_items oi
    where oi.order_id = v_order.id
      and oi.product_id is not null
    group by oi.product_id
  ) stock
  where p.id = stock.product_id
    and p.stock_quantity is not null;

  update public.delivery_assignments
  set status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where order_id = v_order.id
    and status <> 'cancelled';

  get diagnostics v_cancelled_assignments = row_count;

  for v_store in
    select os.id, os.status
    from public.order_stores os
    where os.order_id = v_order.id
    order by os.created_at, os.id
  loop
    update public.order_stores
    set status = 'cancelled',
        updated_at = pg_catalog.now()
    where id = v_store.id;

    insert into public.order_status_events (
      order_id, order_store_id, customer_id, merchant_user_id,
      actor_user_id, actor_role, previous_status, new_status, note
    )
    select
      v_order.id, v_store.id, os.customer_id, os.merchant_user_id,
      v_user_id, 'customer', v_store.status, 'cancelled',
      coalesce(v_note, 'Customer cancelled the complete order before pickup')
    from public.order_stores os
    where os.id = v_store.id;
  end loop;

  update public.orders
  set status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_order.id;

  insert into public.order_status_events (
    order_id, customer_id, actor_user_id, actor_role,
    previous_status, new_status, note
  )
  values (
    v_order.id, v_user_id, v_user_id, 'customer',
    v_order.status, 'cancelled',
    coalesce(v_note, 'Customer cancelled the complete order before pickup')
  );

  return pg_catalog.jsonb_build_object(
    'order_id', v_order.id,
    'status', 'cancelled',
    'cancelled_assignments', v_cancelled_assignments,
    'inventory_restored', true,
    'payment_status', v_order.payment_status,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.customer_cancel_order_before_pickup_v1(uuid, text) from public, anon;
grant execute on function public.customer_cancel_order_before_pickup_v1(uuid, text) to authenticated;

comment on function public.customer_cancel_order_before_pickup_v1(uuid, text) is
  'Customer-only atomic cancellation of the entire COD order before any consignment pickup; restores finite stock and writes immutable status events. No refund or wallet ledger operation is performed.';

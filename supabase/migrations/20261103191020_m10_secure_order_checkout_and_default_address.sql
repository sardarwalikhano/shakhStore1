CREATE OR REPLACE FUNCTION public.set_default_customer_address_v1(p_address_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

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
    and id <> p_address_id;

  update public.customer_addresses
  set is_default = true,
      updated_at = now()
  where id = p_address_id
    and customer_id = v_user_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_order_v1(p_address_id uuid, p_items jsonb, p_idempotency_key text, p_customer_note text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash_on_delivery'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_address public.customer_addresses%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_product record;
  v_order record;
  v_item record;
  v_existing record;
  v_order_id uuid;
  v_order_number text;
  v_order_store_id uuid;
  v_last_store_id uuid;
  v_items_subtotal bigint := 0;
  v_delivery_fee bigint := 0;
  v_total bigint := 0;
  v_store_subtotal bigint := 0;
  v_line_total bigint := 0;
  v_item_count integer := 0;
  v_distinct_count integer := 0;
  v_quantity numeric;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  v_role := public.current_app_role();
  if v_role <> 'customer' then
    raise exception 'CUSTOMER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_payment_method is distinct from 'cash_on_delivery' then
    raise exception 'PAYMENT_METHOD_NOT_ENABLED' using errcode = '22023';
  end if;

  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 160 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if p_customer_note is not null and char_length(p_customer_note) > 1200 then
    raise exception 'CUSTOMER_NOTE_TOO_LONG' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_CART_ITEMS' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_idempotency_key, 0)
  );

  select o.id, o.order_number, o.status, o.payment_status, o.total_iqd
  into v_existing
  from public.orders o
  where o.customer_id = v_user_id
    and o.idempotency_key = p_idempotency_key;

  if found then
    return pg_catalog.jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'payment_status', v_existing.payment_status,
      'total_iqd', v_existing.total_iqd,
      'idempotent_replay', true
    );
  end if;

  select a.*
  into v_address
  from public.customer_addresses a
  where a.id = p_address_id
    and a.customer_id = v_user_id
    and a.is_active = true
  for share;

  if not found then
    raise exception 'ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  select z.*
  into v_zone
  from public.delivery_zones z
  where z.is_active = true
    and pg_catalog.lower(pg_catalog.btrim(z.city)) = pg_catalog.lower(pg_catalog.btrim(v_address.city))
    and (
      z.district is null
      or pg_catalog.lower(pg_catalog.btrim(z.district)) = pg_catalog.lower(pg_catalog.btrim(v_address.district))
    )
  order by (z.district is null) asc, z.created_at desc
  limit 1
  for share;

  if not found then
    raise exception 'DELIVERY_ZONE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if v_zone.per_km_fee_iqd <> 0 then
    raise exception 'DELIVERY_DISTANCE_NOT_CONFIGURED' using errcode = 'P0001';
  end if;

  v_delivery_fee := greatest(v_zone.base_fee_iqd, v_zone.minimum_fee_iqd);
  if v_zone.maximum_fee_iqd is not null then
    v_delivery_fee := least(v_delivery_fee, v_zone.maximum_fee_iqd);
  end if;

  select count(*), count(distinct x.product_id)
  into v_item_count, v_distinct_count
  from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric);

  if v_item_count < 1 or v_item_count > 50
     or exists (
       select 1
       from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
       where x.product_id is null
          or x.quantity is null
          or x.quantity <= 0
          or x.quantity > 9999
     ) then
    raise exception 'INVALID_CART_ITEMS' using errcode = '22023';
  end if;

  if v_distinct_count < 1 then
    raise exception 'INVALID_CART_ITEMS' using errcode = '22023';
  end if;

  for v_item in
    select x.product_id, sum(x.quantity)::numeric as quantity
    from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    group by x.product_id
    order by x.product_id
  loop
    select
      p.id,
      p.name,
      p.description,
      p.price_iqd,
      p.unit,
      p.store_id,
      p.stock_quantity,
      p.status as product_status,
      p.is_available,
      s.name as store_name,
      s.owner_id as merchant_user_id,
      s.status as store_status,
      s.is_platform_store
    into v_product
    from public.products p
    join public.stores s on s.id = p.store_id
    where p.id = v_item.product_id
    for update of p;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_product.product_status <> 'published'
       or v_product.is_available is not true
       or v_product.store_status <> 'active' then
      raise exception 'PRODUCT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;

    if v_product.merchant_user_id is null or v_product.is_platform_store is true then
      raise exception 'STORE_FULFILLMENT_NOT_CONFIGURED' using errcode = 'P0001';
    end if;

    if v_product.unit in ('piece', 'pack') and v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'INVALID_PRODUCT_QUANTITY' using errcode = '22023';
    end if;

    if v_product.stock_quantity is not null
       and v_product.stock_quantity < ceil(v_item.quantity)::integer then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
    end if;

    v_items_subtotal := v_items_subtotal + round(v_product.price_iqd * v_item.quantity)::bigint;
  end loop;

  v_total := v_items_subtotal + v_delivery_fee;

  insert into public.orders (
    customer_id,
    address_id,
    address_snapshot,
    delivery_zone_id,
    status,
    payment_method,
    payment_status,
    currency,
    items_subtotal_iqd,
    delivery_fee_iqd,
    discount_iqd,
    tax_iqd,
    total_iqd,
    customer_note,
    idempotency_key
  )
  values (
    v_user_id,
    v_address.id,
    pg_catalog.jsonb_build_object(
      'recipient_name', v_address.recipient_name,
      'phone', v_address.phone,
      'city', v_address.city,
      'district', v_address.district,
      'address_line', v_address.address_line,
      'latitude', v_address.latitude,
      'longitude', v_address.longitude,
      'delivery_notes', v_address.delivery_notes
    ),
    v_zone.id,
    'placed',
    'cash_on_delivery',
    'pending',
    'IQD',
    v_items_subtotal,
    v_delivery_fee,
    0,
    0,
    v_total,
    nullif(pg_catalog.btrim(coalesce(p_customer_note, '')), ''),
    p_idempotency_key
  )
  returning id, order_number into v_order_id, v_order_number;

  v_last_store_id := null;
  v_order_store_id := null;

  for v_item in
    select
      x.product_id,
      sum(x.quantity)::numeric as quantity,
      p.name,
      p.description,
      p.price_iqd,
      p.unit,
      p.store_id,
      p.stock_quantity,
      s.name as store_name,
      s.owner_id as merchant_user_id
    from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    join public.products p on p.id = x.product_id
    join public.stores s on s.id = p.store_id
    group by x.product_id, p.id, s.id
    order by p.store_id, x.product_id
  loop
    if v_last_store_id is distinct from v_item.store_id then
      select coalesce(sum(round(p.price_iqd * x.quantity)::bigint), 0)
      into v_store_subtotal
      from (
        select q.product_id, sum(q.quantity)::numeric as quantity
        from pg_catalog.jsonb_to_recordset(p_items) as q(product_id uuid, quantity numeric)
        group by q.product_id
      ) x
      join public.products p on p.id = x.product_id
      where p.store_id = v_item.store_id;

      insert into public.order_stores (
        order_id,
        customer_id,
        store_id,
        merchant_user_id,
        store_name_snapshot,
        status,
        items_subtotal_iqd,
        merchant_commission_iqd,
        commission_snapshot
      )
      values (
        v_order_id,
        v_user_id,
        v_item.store_id,
        v_item.merchant_user_id,
        v_item.store_name,
        'placed',
        v_store_subtotal,
        0,
        pg_catalog.jsonb_build_object(
          'status', 'not_applied',
          'reason', 'commission_policy_requires_confirmation'
        )
      )
      returning id into v_order_store_id;

      insert into public.delivery_assignments (
        order_id,
        order_store_id,
        customer_id,
        merchant_user_id,
        status
      )
      values (
        v_order_id,
        v_order_store_id,
        v_user_id,
        v_item.merchant_user_id,
        'awaiting_captain'
      );

      v_last_store_id := v_item.store_id;
    end if;

    v_line_total := round(v_item.price_iqd * v_item.quantity)::bigint;

    insert into public.order_items (
      order_id,
      order_store_id,
      customer_id,
      merchant_user_id,
      store_id,
      product_id,
      product_snapshot,
      quantity,
      unit,
      unit_price_iqd,
      line_total_iqd,
      weight_kg,
      commission_per_kg_iqd,
      merchant_commission_iqd
    )
    values (
      v_order_id,
      v_order_store_id,
      v_user_id,
      v_item.merchant_user_id,
      v_item.store_id,
      v_item.product_id,
      pg_catalog.jsonb_build_object(
        'name', v_item.name,
        'description', v_item.description,
        'unit', v_item.unit,
        'unit_price_iqd', v_item.price_iqd
      ),
      v_item.quantity,
      v_item.unit,
      v_item.price_iqd,
      v_line_total,
      case when v_item.unit = 'kg' then v_item.quantity else null end,
      null,
      0
    );

    if v_item.stock_quantity is not null then
      update public.products
      set stock_quantity = stock_quantity - ceil(v_item.quantity)::integer,
          updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  insert into public.order_status_events (
    order_id,
    customer_id,
    actor_user_id,
    actor_role,
    previous_status,
    new_status,
    note
  )
  values (
    v_order_id,
    v_user_id,
    v_user_id,
    'customer',
    null,
    'placed',
    'Order placed through Shakh Store checkout'
  );

  return pg_catalog.jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'placed',
    'payment_method', 'cash_on_delivery',
    'payment_status', 'pending',
    'items_subtotal_iqd', v_items_subtotal,
    'delivery_fee_iqd', v_delivery_fee,
    'total_iqd', v_total,
    'idempotent_replay', false
  );
end;
$function$


revoke all on function public.set_default_customer_address_v1(uuid) from public, anon;
grant execute on function public.set_default_customer_address_v1(uuid) to authenticated;
revoke all on function public.create_order_v1(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.create_order_v1(uuid, jsonb, text, text, text) to authenticated;
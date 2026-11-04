-- Product media storage, fractional inventory and order quantity constraints.
-- The initial storage policy path expression is corrected in the following migration.

ALTER TABLE public.products
  ADD COLUMN image_url text,
  ADD COLUMN min_order_quantity numeric(12,3) NOT NULL DEFAULT 1,
  ADD COLUMN max_order_quantity numeric(12,3),
  ADD COLUMN quantity_step numeric(12,3) NOT NULL DEFAULT 1;

ALTER TABLE public.products
  ALTER COLUMN stock_quantity TYPE numeric(12,3)
  USING stock_quantity::numeric(12,3);

ALTER TABLE public.products
  ADD CONSTRAINT products_image_url_https CHECK (image_url IS NULL OR (char_length(image_url)<=2048 AND image_url LIKE 'https://%')),
  ADD CONSTRAINT products_min_order_quantity_positive CHECK (min_order_quantity>0),
  ADD CONSTRAINT products_max_order_quantity_valid CHECK (max_order_quantity IS NULL OR max_order_quantity>=min_order_quantity),
  ADD CONSTRAINT products_quantity_step_positive CHECK (quantity_step>0),
  ADD CONSTRAINT products_unit_supported CHECK (unit IN ('piece','kg','g','liter','ml','pack','bottle','box','dozen'));

GRANT INSERT (store_id,category_id,name,description,sku,price_iqd,compare_at_price_iqd,stock_quantity,unit,image_url,min_order_quantity,max_order_quantity,quantity_step)
ON public.products TO authenticated;
GRANT UPDATE (category_id,name,description,sku,price_iqd,compare_at_price_iqd,stock_quantity,unit,image_url,min_order_quantity,max_order_quantity,quantity_step)
ON public.products TO authenticated;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('product-images','product-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY product_images_insert_store_owner ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='product-images' AND (storage.foldername(name))[2]=(SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text=(storage.foldername(name))[1] AND s.status='active'
    AND ((s.is_platform_store IS TRUE AND public.current_app_role()='super_admin')
      OR (s.is_platform_store IS FALSE AND public.current_app_role()='admin')
      OR (s.is_platform_store IS FALSE AND s.owner_id=(SELECT auth.uid()) AND (
        (s.merchant_category='restaurant' AND public.current_app_role()='restaurant')
        OR (s.merchant_category='supermarket' AND public.current_app_role()='supermarket')
        OR (s.merchant_category='fruits_vegetables' AND public.current_app_role()='produce_vendor')
        OR (s.merchant_category='meat_seafood' AND public.current_app_role()='meat_seafood_vendor')
      )))
  )
);
CREATE POLICY product_images_delete_store_owner ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='product-images' AND (storage.foldername(name))[2]=(SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text=(storage.foldername(name))[1]
    AND ((s.is_platform_store IS TRUE AND public.current_app_role()='super_admin')
      OR (s.is_platform_store IS FALSE AND public.current_app_role()='admin')
      OR (s.is_platform_store IS FALSE AND s.owner_id=(SELECT auth.uid()) AND (
        (s.merchant_category='restaurant' AND public.current_app_role()='restaurant')
        OR (s.merchant_category='supermarket' AND public.current_app_role()='supermarket')
        OR (s.merchant_category='fruits_vegetables' AND public.current_app_role()='produce_vendor')
        OR (s.merchant_category='meat_seafood' AND public.current_app_role()='meat_seafood_vendor')
      )))
  )
);

CREATE OR REPLACE FUNCTION private.create_order_v1(p_address_id uuid, p_items jsonb, p_idempotency_key text, p_customer_note text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash_on_delivery'::text)
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
      p.min_order_quantity,
      p.max_order_quantity,
      p.quantity_step,
      p.image_url,
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

    if v_item.quantity < v_product.min_order_quantity
       or (v_product.max_order_quantity is not null and v_item.quantity > v_product.max_order_quantity)
       or mod(round(v_item.quantity - v_product.min_order_quantity, 3), v_product.quantity_step) <> 0
       or (v_product.unit in ('piece', 'pack', 'bottle', 'box', 'dozen', 'g', 'ml') and v_item.quantity <> trunc(v_item.quantity)) then
      raise exception 'INVALID_PRODUCT_QUANTITY' using errcode = '22023';
    end if;

    if v_product.stock_quantity is not null
       and v_product.stock_quantity < v_item.quantity then
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
      p.image_url,
      p.min_order_quantity,
      p.max_order_quantity,
      p.quantity_step,
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
        'unit_price_iqd', v_item.price_iqd,
        'image_url', v_item.image_url,
        'min_order_quantity', v_item.min_order_quantity,
        'max_order_quantity', v_item.max_order_quantity,
        'quantity_step', v_item.quantity_step
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
      set stock_quantity = stock_quantity - v_item.quantity,
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
;

CREATE OR REPLACE FUNCTION private.admin_set_product_status_v1(p_product_id uuid, p_new_status text, p_reason text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_actor_role text;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_product record;
  v_event_id uuid;
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT u.raw_app_meta_data ->> 'role'
    INTO v_actor_role
  FROM auth.users AS u
  WHERE u.id = v_actor_user_id;

  IF COALESCE(v_actor_role, '') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_new_status IS NULL
     OR p_new_status NOT IN ('draft', 'published', 'archived') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_STATUS' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_reason) < 2 OR char_length(v_reason) > 1200 THEN
    RAISE EXCEPTION 'INVALID_MODERATION_REASON' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_PRODUCT_VERSION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT
    p.id,
    p.store_id,
    p.status AS product_status,
    p.price_iqd,
    p.is_available,
    p.category_id,
    p.image_url,
    p.updated_at,
    s.status AS store_status,
    s.is_platform_store
  INTO v_product
  FROM public.products AS p
  JOIN public.stores AS s ON s.id = p.store_id
  WHERE p.id = p_product_id
  FOR UPDATE OF p, s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_product.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'PRODUCT_CHANGED_REFRESH_AND_REVIEW_AGAIN' USING ERRCODE = '40001';
  END IF;

  IF v_product.is_platform_store IS TRUE AND v_actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED_FOR_PLATFORM_STORE' USING ERRCODE = '42501';
  END IF;

  IF v_product.product_status = p_new_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'product_id', v_product.id,
      'previous_status', v_product.product_status,
      'status', v_product.product_status,
      'idempotent_replay', true
    );
  END IF;

  IF v_product.product_status = 'archived' AND p_new_status = 'published' THEN
    RAISE EXCEPTION 'ARCHIVED_PRODUCT_MUST_RETURN_TO_DRAFT_FIRST'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_new_status = 'published' THEN
    IF v_product.store_status <> 'active' THEN
      RAISE EXCEPTION 'STORE_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;

    IF v_product.price_iqd <= 0
       OR v_product.is_available IS NOT TRUE
       OR v_product.category_id IS NULL
       OR v_product.image_url IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_INCOMPLETE' USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public.catalog_categories AS c
    WHERE c.id = v_product.category_id
      AND c.is_active IS TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_CATEGORY_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.products
  SET status = p_new_status
  WHERE id = v_product.id;

  INSERT INTO public.product_moderation_events (
    product_id,
    store_id,
    actor_user_id,
    actor_role,
    previous_status,
    new_status,
    reviewed_updated_at,
    reason
  )
  VALUES (
    v_product.id,
    v_product.store_id,
    v_actor_user_id,
    v_actor_role,
    v_product.product_status,
    p_new_status,
    v_product.updated_at,
    v_reason
  )
  RETURNING id INTO v_event_id;

  RETURN pg_catalog.jsonb_build_object(
    'product_id', v_product.id,
    'store_id', v_product.store_id,
    'previous_status', v_product.product_status,
    'status', p_new_status,
    'audit_event_id', v_event_id,
    'actor_role', v_actor_role,
    'idempotent_replay', false
  );
END;
$function$
;

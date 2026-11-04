-- M15: trusted merchant order and captain delivery transitions.
-- All writes go through SECURITY DEFINER functions with explicit role/ownership checks.

create or replace function private.recalculate_order_status_v1(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_total integer;
  v_cancelled integer;
  v_delivered integer;
  v_picked_up integer;
  v_ready integer;
  v_preparing integer;
  v_accepted integer;
begin
  perform 1 from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(*) filter (where os.status = 'cancelled')::integer,
    count(*) filter (where os.status = 'delivered')::integer,
    count(*) filter (where os.status = 'picked_up')::integer,
    count(*) filter (where os.status = 'ready_for_pickup')::integer,
    count(*) filter (where os.status = 'preparing')::integer,
    count(*) filter (where os.status = 'accepted')::integer
  into v_total, v_cancelled, v_delivered, v_picked_up,
       v_ready, v_preparing, v_accepted
  from public.order_stores os
  where os.order_id = p_order_id;

  if v_total = 0 then
    raise exception 'ORDER_HAS_NO_STORE_LINES' using errcode = 'P0001';
  end if;

  if v_cancelled = v_total then
    v_status := 'cancelled';
  elsif v_delivered = v_total then
    v_status := 'delivered';
  elsif (v_picked_up + v_delivered) > 0 then
    v_status := 'out_for_delivery';
  elsif v_ready = v_total then
    v_status := 'ready_for_pickup';
  elsif v_ready > 0 then
    v_status := 'partially_ready';
  elsif v_preparing > 0 then
    v_status := 'preparing';
  elsif v_accepted > 0 then
    v_status := 'accepted';
  else
    v_status := 'placed';
  end if;

  update public.orders
  set status = v_status,
      delivered_at = case
        when v_status = 'delivered' then coalesce(delivered_at, pg_catalog.now())
        else delivered_at
      end,
      updated_at = pg_catalog.now()
  where id = p_order_id;

  return v_status;
end;
$function$;

create or replace function private.merchant_update_order_store_status_v1(
  p_order_store_id uuid, p_new_status text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.current_app_role();
  v_order_store public.order_stores%rowtype;
  v_parent_status text;
  v_note text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_note, '')), 1200), '');
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role is null or v_role not in ('restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor') then
    raise exception 'MERCHANT_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_new_status is null or p_new_status not in ('accepted', 'preparing', 'ready_for_pickup') then
    raise exception 'INVALID_MERCHANT_ORDER_STATUS' using errcode = '22023';
  end if;

  select * into v_order_store
  from public.order_stores os
  where os.id = p_order_store_id
  for update;

  if not found then
    raise exception 'ORDER_STORE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order_store.merchant_user_id <> v_user_id then
    raise exception 'ORDER_STORE_NOT_OWNED' using errcode = '42501';
  end if;

  if v_order_store.status = p_new_status then
    return pg_catalog.jsonb_build_object(
      'order_store_id', v_order_store.id,
      'status', v_order_store.status,
      'idempotent_replay', true
    );
  end if;

  if not (
    (v_order_store.status = 'placed' and p_new_status = 'accepted')
    or (v_order_store.status = 'accepted' and p_new_status = 'preparing')
    or (v_order_store.status = 'preparing' and p_new_status = 'ready_for_pickup')
  ) then
    raise exception 'INVALID_ORDER_TRANSITION' using errcode = 'P0001';
  end if;

  update public.order_stores
  set status = p_new_status, updated_at = pg_catalog.now()
  where id = v_order_store.id;

  insert into public.order_status_events (
    order_id, order_store_id, customer_id, merchant_user_id,
    actor_user_id, actor_role, previous_status, new_status, note
  )
  values (
    v_order_store.order_id, v_order_store.id, v_order_store.customer_id,
    v_order_store.merchant_user_id, v_user_id, v_role,
    v_order_store.status, p_new_status, v_note
  );

  v_parent_status := private.recalculate_order_status_v1(v_order_store.order_id);

  return pg_catalog.jsonb_build_object(
    'order_store_id', v_order_store.id,
    'status', p_new_status,
    'order_status', v_parent_status,
    'idempotent_replay', false
  );
end;
$function$;

create or replace function private.admin_assign_delivery_captain_v1(
  p_assignment_id uuid, p_captain_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.current_app_role();
  v_assignment public.delivery_assignments%rowtype;
  v_store_status text;
  v_captain_role text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role is null or v_role not in ('admin', 'super_admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_captain_user_id is null then
    raise exception 'CAPTAIN_REQUIRED' using errcode = '22023';
  end if;

  select u.raw_app_meta_data ->> 'role'
  into v_captain_role
  from auth.users u
  where u.id = p_captain_user_id;

  if coalesce(v_captain_role, '') <> 'captain' then
    raise exception 'TARGET_USER_IS_NOT_CAPTAIN' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.delivery_assignments da
  where da.id = p_assignment_id
  for update;

  if not found then
    raise exception 'DELIVERY_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_assignment.status = 'assigned'
     and v_assignment.captain_user_id = p_captain_user_id then
    return pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment.id,
      'captain_user_id', v_assignment.captain_user_id,
      'status', v_assignment.status,
      'idempotent_replay', true
    );
  end if;

  if v_assignment.status <> 'awaiting_captain'
     or v_assignment.captain_user_id is not null then
    raise exception 'DELIVERY_ALREADY_ASSIGNED' using errcode = 'P0001';
  end if;

  select os.status into v_store_status
  from public.order_stores os
  where os.id = v_assignment.order_store_id
  for update;

  if not found or v_store_status <> 'ready_for_pickup' then
    raise exception 'ORDER_NOT_READY_FOR_PICKUP' using errcode = 'P0001';
  end if;

  update public.delivery_assignments
  set captain_user_id = p_captain_user_id,
      status = 'assigned',
      assigned_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_assignment.id;

  insert into public.order_status_events (
    order_id, order_store_id, customer_id, merchant_user_id,
    actor_user_id, actor_role, previous_status, new_status, note
  )
  values (
    v_assignment.order_id, v_assignment.order_store_id,
    v_assignment.customer_id, v_assignment.merchant_user_id,
    v_user_id, v_role, 'awaiting_captain', 'assigned',
    'Delivery captain assigned by administrator'
  );

  return pg_catalog.jsonb_build_object(
    'assignment_id', v_assignment.id,
    'captain_user_id', p_captain_user_id,
    'status', 'assigned',
    'idempotent_replay', false
  );
end;
$function$;

create or replace function private.captain_update_delivery_status_v1(
  p_assignment_id uuid, p_new_status text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.current_app_role();
  v_assignment public.delivery_assignments%rowtype;
  v_order_store public.order_stores%rowtype;
  v_parent_status text;
  v_note text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_note, '')), 1200), '');
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role is distinct from 'captain' then
    raise exception 'CAPTAIN_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_new_status is null or p_new_status not in ('accepted', 'picked_up', 'on_the_way', 'delivered') then
    raise exception 'INVALID_DELIVERY_STATUS' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.delivery_assignments da
  where da.id = p_assignment_id
  for update;

  if not found then
    raise exception 'DELIVERY_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_assignment.captain_user_id is distinct from v_user_id then
    raise exception 'DELIVERY_NOT_ASSIGNED_TO_CAPTAIN' using errcode = '42501';
  end if;

  if v_assignment.status = p_new_status then
    return pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment.id,
      'status', v_assignment.status,
      'idempotent_replay', true
    );
  end if;

  if not (
    (v_assignment.status = 'assigned' and p_new_status = 'accepted')
    or (v_assignment.status = 'accepted' and p_new_status = 'picked_up')
    or (v_assignment.status = 'picked_up' and p_new_status = 'on_the_way')
    or (v_assignment.status = 'on_the_way' and p_new_status = 'delivered')
  ) then
    raise exception 'INVALID_DELIVERY_TRANSITION' using errcode = 'P0001';
  end if;

  select * into v_order_store
  from public.order_stores os
  where os.id = v_assignment.order_store_id
  for update;

  if not found then
    raise exception 'ORDER_STORE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_new_status = 'picked_up' then
    if v_order_store.status <> 'ready_for_pickup' then
      raise exception 'ORDER_NOT_READY_FOR_PICKUP' using errcode = 'P0001';
    end if;
    update public.order_stores
    set status = 'picked_up', updated_at = pg_catalog.now()
    where id = v_order_store.id;
  elsif p_new_status = 'delivered' then
    if v_order_store.status <> 'picked_up' then
      raise exception 'ORDER_NOT_PICKED_UP' using errcode = 'P0001';
    end if;
    update public.order_stores
    set status = 'delivered', updated_at = pg_catalog.now()
    where id = v_order_store.id;
  end if;

  update public.delivery_assignments
  set status = p_new_status,
      accepted_at = case when p_new_status = 'accepted' then pg_catalog.now() else accepted_at end,
      picked_up_at = case when p_new_status = 'picked_up' then pg_catalog.now() else picked_up_at end,
      delivered_at = case when p_new_status = 'delivered' then pg_catalog.now() else delivered_at end,
      updated_at = pg_catalog.now()
  where id = v_assignment.id;

  insert into public.order_status_events (
    order_id, order_store_id, customer_id, merchant_user_id,
    actor_user_id, actor_role, previous_status, new_status, note
  )
  values (
    v_assignment.order_id, v_assignment.order_store_id,
    v_assignment.customer_id, v_assignment.merchant_user_id,
    v_user_id, v_role, v_assignment.status, p_new_status, v_note
  );

  if p_new_status in ('picked_up', 'delivered') then
    v_parent_status := private.recalculate_order_status_v1(v_assignment.order_id);
  else
    select o.status into v_parent_status
    from public.orders o
    where o.id = v_assignment.order_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'assignment_id', v_assignment.id,
    'status', p_new_status,
    'order_status', v_parent_status,
    'idempotent_replay', false
  );
end;
$function$;

revoke all on function private.recalculate_order_status_v1(uuid) from public, anon, authenticated;
revoke all on function private.merchant_update_order_store_status_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function private.admin_assign_delivery_captain_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function private.captain_update_delivery_status_v1(uuid, text, text) from public, anon, authenticated;

grant execute on function private.merchant_update_order_store_status_v1(uuid, text, text) to authenticated;
grant execute on function private.admin_assign_delivery_captain_v1(uuid, uuid) to authenticated;
grant execute on function private.captain_update_delivery_status_v1(uuid, text, text) to authenticated;

create or replace function public.merchant_update_order_store_status_v1(
  p_order_store_id uuid, p_new_status text, p_note text default null
)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select private.merchant_update_order_store_status_v1(p_order_store_id, p_new_status, p_note);
$function$;

create or replace function public.admin_assign_delivery_captain_v1(
  p_assignment_id uuid, p_captain_user_id uuid
)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select private.admin_assign_delivery_captain_v1(p_assignment_id, p_captain_user_id);
$function$;

create or replace function public.captain_update_delivery_status_v1(
  p_assignment_id uuid, p_new_status text, p_note text default null
)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select private.captain_update_delivery_status_v1(p_assignment_id, p_new_status, p_note);
$function$;

revoke all on function public.merchant_update_order_store_status_v1(uuid, text, text) from public, anon;
revoke all on function public.admin_assign_delivery_captain_v1(uuid, uuid) from public, anon;
revoke all on function public.captain_update_delivery_status_v1(uuid, text, text) from public, anon;

grant execute on function public.merchant_update_order_store_status_v1(uuid, text, text) to authenticated;
grant execute on function public.admin_assign_delivery_captain_v1(uuid, uuid) to authenticated;
grant execute on function public.captain_update_delivery_status_v1(uuid, text, text) to authenticated;

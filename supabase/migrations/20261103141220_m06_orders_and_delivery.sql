-- M06: multi-store orders, item/price snapshots, status history and captain delivery tracking.
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 order_number text not null unique default ('SHK-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 customer_id uuid not null references auth.users(id) on delete restrict,
 address_id uuid references public.customer_addresses(id) on delete set null,
 address_snapshot jsonb not null,
 delivery_zone_id uuid references public.delivery_zones(id) on delete set null,
 status text not null default 'placed' check(status in ('pending_payment','placed','accepted','preparing','partially_ready','ready_for_pickup','out_for_delivery','delivered','cancelled','payment_failed','refund_requested','refunded')),
 payment_method text not null check(payment_method in ('cash_on_delivery','shakh_wallet')),
 payment_status text not null default 'pending' check(payment_status in ('pending','paid','partially_refunded','refunded','failed')),
 currency text not null default 'IQD' check(currency='IQD'),
 items_subtotal_iqd bigint not null check(items_subtotal_iqd>=0),
 delivery_fee_iqd bigint not null default 0 check(delivery_fee_iqd>=0),
 discount_iqd bigint not null default 0 check(discount_iqd>=0),
 tax_iqd bigint not null default 0 check(tax_iqd>=0),
 total_iqd bigint not null check(total_iqd>=0),
 distance_km numeric(8,2) check(distance_km is null or distance_km>=0),
 customer_note text, idempotency_key text not null,
 placed_at timestamptz not null default now(), delivered_at timestamptz, cancelled_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint orders_total_math check(total_iqd=items_subtotal_iqd+delivery_fee_iqd+tax_iqd-discount_iqd),
 constraint orders_note_length check(customer_note is null or char_length(customer_note)<=1200),
 constraint orders_idempotency_length check(char_length(idempotency_key) between 8 and 160),
 unique(customer_id,idempotency_key)
);

create table public.order_stores (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete restrict,
 store_id uuid not null references public.stores(id) on delete restrict,
 merchant_user_id uuid not null references auth.users(id) on delete restrict,
 store_name_snapshot text not null,
 status text not null default 'placed' check(status in ('placed','accepted','preparing','ready_for_pickup','picked_up','delivered','cancelled')),
 items_subtotal_iqd bigint not null check(items_subtotal_iqd>=0),
 merchant_commission_iqd bigint not null default 0 check(merchant_commission_iqd>=0),
 commission_snapshot jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(order_id,store_id), constraint order_stores_name_length check(char_length(store_name_snapshot) between 2 and 160)
);
create index order_stores_customer_created_idx on public.order_stores(customer_id,created_at desc);
create index order_stores_merchant_created_idx on public.order_stores(merchant_user_id,created_at desc);
create index order_stores_store_created_idx on public.order_stores(store_id,created_at desc);

create table public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 order_store_id uuid not null references public.order_stores(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete restrict,
 merchant_user_id uuid not null references auth.users(id) on delete restrict,
 store_id uuid not null references public.stores(id) on delete restrict,
 product_id uuid references public.products(id) on delete set null,
 product_snapshot jsonb not null,
 quantity numeric(12,3) not null check(quantity>0), unit text not null,
 unit_price_iqd bigint not null check(unit_price_iqd>=0),
 line_total_iqd bigint not null check(line_total_iqd>=0),
 weight_kg numeric(12,3) check(weight_kg is null or weight_kg>=0),
 commission_per_kg_iqd bigint check(commission_per_kg_iqd is null or commission_per_kg_iqd>=0),
 merchant_commission_iqd bigint not null default 0 check(merchant_commission_iqd>=0),
 created_at timestamptz not null default now(),
 constraint order_items_unit_length check(char_length(unit) between 1 and 32)
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_order_store_idx on public.order_items(order_store_id);
create index order_items_merchant_idx on public.order_items(merchant_user_id,created_at desc);

create table public.order_status_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 order_store_id uuid references public.order_stores(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete restrict,
 merchant_user_id uuid references auth.users(id) on delete restrict,
 actor_user_id uuid references auth.users(id) on delete set null,
 actor_role text, previous_status text, new_status text not null, note text,
 created_at timestamptz not null default now(),
 constraint order_status_events_note_length check(note is null or char_length(note)<=1200)
);
create index order_status_events_order_created_idx on public.order_status_events(order_id,created_at desc);

create table public.delivery_assignments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 order_store_id uuid not null unique references public.order_stores(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete restrict,
 merchant_user_id uuid not null references auth.users(id) on delete restrict,
 captain_user_id uuid references auth.users(id) on delete restrict,
 status text not null default 'awaiting_captain' check(status in ('awaiting_captain','assigned','accepted','picked_up','on_the_way','delivered','cancelled')),
 assigned_at timestamptz,accepted_at timestamptz,picked_up_at timestamptz,delivered_at timestamptz,cancelled_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index delivery_assignments_captain_status_idx on public.delivery_assignments(captain_user_id,status,created_at desc);
create index delivery_assignments_customer_created_idx on public.delivery_assignments(customer_id,created_at desc);

create table public.delivery_location_updates (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public.delivery_assignments(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete restrict,
 captain_user_id uuid not null references auth.users(id) on delete restrict,
 latitude numeric(10,7) not null check(latitude between -90 and 90),
 longitude numeric(10,7) not null check(longitude between -180 and 180),
 accuracy_meters numeric(8,2) check(accuracy_meters is null or accuracy_meters>=0),
 heading_degrees numeric(6,2) check(heading_degrees is null or heading_degrees between 0 and 360),
 speed_meters_per_second numeric(8,2) check(speed_meters_per_second is null or speed_meters_per_second>=0),
 recorded_at timestamptz not null default now()
);
create index delivery_location_updates_assignment_recorded_idx on public.delivery_location_updates(assignment_id,recorded_at desc);

create trigger orders_set_updated_at before update on public.orders for each row execute function private.set_updated_at();
create trigger order_stores_set_updated_at before update on public.order_stores for each row execute function private.set_updated_at();
create trigger delivery_assignments_set_updated_at before update on public.delivery_assignments for each row execute function private.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_stores enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_events enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.delivery_location_updates enable row level security;

create policy orders_select_participant on public.orders for select to authenticated using(
 customer_id=(select auth.uid()) or public.current_app_role() in ('admin','super_admin')
 or exists(select 1 from public.order_stores os where os.order_id=orders.id and os.merchant_user_id=(select auth.uid()))
 or exists(select 1 from public.delivery_assignments da where da.order_id=orders.id and da.captain_user_id=(select auth.uid()))
);
create policy order_stores_select_participant on public.order_stores for select to authenticated using(
 customer_id=(select auth.uid()) or merchant_user_id=(select auth.uid())
 or public.current_app_role() in ('admin','super_admin')
 or exists(select 1 from public.delivery_assignments da where da.order_store_id=order_stores.id and da.captain_user_id=(select auth.uid()))
);
create policy order_items_select_participant on public.order_items for select to authenticated using(
 customer_id=(select auth.uid()) or merchant_user_id=(select auth.uid())
 or public.current_app_role() in ('admin','super_admin')
 or exists(select 1 from public.delivery_assignments da where da.order_store_id=order_items.order_store_id and da.captain_user_id=(select auth.uid()))
);
create policy order_status_events_select_participant on public.order_status_events for select to authenticated using(
 customer_id=(select auth.uid()) or merchant_user_id=(select auth.uid()) or public.current_app_role() in ('admin','super_admin')
);
create policy delivery_assignments_select_participant on public.delivery_assignments for select to authenticated using(
 customer_id=(select auth.uid()) or merchant_user_id=(select auth.uid()) or captain_user_id=(select auth.uid())
 or public.current_app_role() in ('admin','super_admin')
);
create policy delivery_location_updates_select_participant on public.delivery_location_updates for select to authenticated using(
 captain_user_id=(select auth.uid()) or customer_id=(select auth.uid()) or public.current_app_role() in ('admin','super_admin')
);
create policy delivery_location_updates_insert_captain on public.delivery_location_updates for insert to authenticated with check(
 captain_user_id=(select auth.uid()) and public.current_app_role()='captain'
 and exists(select 1 from public.delivery_assignments da where da.id=delivery_location_updates.assignment_id
 and da.order_id=delivery_location_updates.order_id and da.customer_id=delivery_location_updates.customer_id
 and da.captain_user_id=(select auth.uid()) and da.status in ('assigned','accepted','picked_up','on_the_way'))
);

revoke all privileges on public.orders,public.order_stores,public.order_items,public.order_status_events,public.delivery_assignments,public.delivery_location_updates from anon,authenticated;
grant select on public.orders,public.order_stores,public.order_items,public.order_status_events,public.delivery_assignments to authenticated;
grant select,insert on public.delivery_location_updates to authenticated;
grant all privileges on public.orders,public.order_stores,public.order_items,public.order_status_events,public.delivery_assignments,public.delivery_location_updates to service_role;
comment on table public.orders is 'Order header with immutable pricing snapshot totals in integer IQD.';
comment on table public.order_items is 'Immutable product and price snapshots; quantities support kg-based and unit-based items.';
comment on table public.order_status_events is 'Append-only event trail; all client writes are denied.';

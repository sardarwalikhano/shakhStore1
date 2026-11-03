-- M05: customer delivery addresses and delivery-zone configuration.
create table public.customer_addresses (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id) on delete restrict,
 label text not null default 'ماڵ',
 recipient_name text not null, phone text not null, city text not null,
 district text not null, address_line text not null,
 latitude numeric(10,7) check(latitude is null or latitude between -90 and 90),
 longitude numeric(10,7) check(longitude is null or longitude between -180 and 180),
 delivery_notes text, is_default boolean not null default false, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint customer_addresses_label_length check(char_length(label) between 1 and 60),
 constraint customer_addresses_recipient_length check(char_length(recipient_name) between 2 and 120),
 constraint customer_addresses_phone_length check(char_length(phone) between 7 and 32),
 constraint customer_addresses_city_length check(char_length(city) between 2 and 100),
 constraint customer_addresses_district_length check(char_length(district) between 2 and 120),
 constraint customer_addresses_line_length check(char_length(address_line) between 3 and 300),
 constraint customer_addresses_notes_length check(delivery_notes is null or char_length(delivery_notes)<=500)
);
create unique index customer_addresses_one_default_idx on public.customer_addresses(customer_id)
where is_default=true and is_active=true;
create index customer_addresses_customer_created_idx on public.customer_addresses(customer_id,created_at desc);

create table public.delivery_zones (
 id uuid primary key default gen_random_uuid(),
 name_ckb text not null, city text not null, district text,
 base_fee_iqd bigint not null default 0 check(base_fee_iqd>=0),
 per_km_fee_iqd bigint not null default 0 check(per_km_fee_iqd>=0),
 minimum_fee_iqd bigint not null default 0 check(minimum_fee_iqd>=0),
 maximum_fee_iqd bigint check(maximum_fee_iqd is null or maximum_fee_iqd>=minimum_fee_iqd),
 maximum_distance_km numeric(8,2) check(maximum_distance_km is null or maximum_distance_km>0),
 is_active boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint delivery_zones_name_length check(char_length(name_ckb) between 2 and 120),
 constraint delivery_zones_city_length check(char_length(city) between 2 and 100),
 constraint delivery_zones_district_length check(district is null or char_length(district)<=120)
);
create index delivery_zones_city_active_idx on public.delivery_zones(city,is_active);

create trigger customer_addresses_set_updated_at before update on public.customer_addresses
for each row execute function private.set_updated_at();
create trigger delivery_zones_set_updated_at before update on public.delivery_zones
for each row execute function private.set_updated_at();

alter table public.customer_addresses enable row level security;
alter table public.delivery_zones enable row level security;
create policy customer_addresses_select_own on public.customer_addresses for select to authenticated
using(customer_id=(select auth.uid()));
create policy customer_addresses_insert_own on public.customer_addresses for insert to authenticated
with check(customer_id=(select auth.uid()));
create policy customer_addresses_update_own on public.customer_addresses for update to authenticated
using(customer_id=(select auth.uid())) with check(customer_id=(select auth.uid()));
create policy customer_addresses_delete_own on public.customer_addresses for delete to authenticated
using(customer_id=(select auth.uid()));
create policy delivery_zones_public_read_active on public.delivery_zones for select to anon,authenticated
using(is_active=true or public.current_app_role() in ('admin','super_admin'));

revoke all privileges on public.customer_addresses,public.delivery_zones from anon,authenticated;
grant select,insert,update,delete on public.customer_addresses to authenticated;
grant select on public.delivery_zones to anon,authenticated;
grant all privileges on public.customer_addresses,public.delivery_zones to service_role;

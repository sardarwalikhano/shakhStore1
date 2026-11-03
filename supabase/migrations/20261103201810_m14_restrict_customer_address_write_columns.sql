revoke insert, update on table public.customer_addresses from authenticated;

revoke insert (
  id, customer_id, label, recipient_name, phone, city, district,
  address_line, latitude, longitude, delivery_notes,
  is_default, is_active, created_at, updated_at
) on table public.customer_addresses from authenticated;

revoke update (
  id, customer_id, label, recipient_name, phone, city, district,
  address_line, latitude, longitude, delivery_notes,
  is_default, is_active, created_at, updated_at
) on table public.customer_addresses from authenticated;

grant insert (
  customer_id, label, recipient_name, phone, city, district,
  address_line, latitude, longitude, delivery_notes
) on table public.customer_addresses to authenticated;

grant update (
  label, recipient_name, phone, city, district,
  address_line, latitude, longitude, delivery_notes
) on table public.customer_addresses to authenticated;

drop policy if exists customer_addresses_insert_own on public.customer_addresses;
create policy customer_addresses_insert_own
on public.customer_addresses
for insert
to authenticated
with check (
  customer_id = (select auth.uid())
  and is_default = false
  and is_active = true
);

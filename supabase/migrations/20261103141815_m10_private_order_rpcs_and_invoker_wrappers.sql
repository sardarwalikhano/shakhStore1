alter function public.create_order_v1(uuid, jsonb, text, text, text) set schema private;
alter function public.set_default_customer_address_v1(uuid) set schema private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.create_order_v1(uuid, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function private.set_default_customer_address_v1(uuid) from public, anon, authenticated;
grant execute on function private.create_order_v1(uuid, jsonb, text, text, text) to authenticated;
grant execute on function private.set_default_customer_address_v1(uuid) to authenticated;
create or replace function public.create_order_v1(p_address_id uuid,p_items jsonb,p_idempotency_key text,p_customer_note text default null,p_payment_method text default 'cash_on_delivery')
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.create_order_v1(p_address_id,p_items,p_idempotency_key,p_customer_note,p_payment_method); $function$;
create or replace function public.set_default_customer_address_v1(p_address_id uuid)
returns void language sql security invoker set search_path = ''
as $function$ select private.set_default_customer_address_v1(p_address_id); $function$;
revoke all on function public.create_order_v1(uuid, jsonb, text, text, text) from public, anon;
revoke all on function public.set_default_customer_address_v1(uuid) from public, anon;
grant execute on function public.create_order_v1(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.set_default_customer_address_v1(uuid) to authenticated;
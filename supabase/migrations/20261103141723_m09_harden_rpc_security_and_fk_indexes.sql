-- M09: harden public RPC privileges and cover foreign-key lookup paths.
drop policy if exists commission_rules_select_admin on public.commission_rules;
create policy commission_rules_select_active on public.commission_rules
for select to authenticated using(is_active=true or public.current_app_role()='super_admin');
create policy commission_rules_insert_super_admin on public.commission_rules
for insert to authenticated with check(public.current_app_role()='super_admin');
create policy commission_rules_update_super_admin on public.commission_rules
for update to authenticated using(public.current_app_role()='super_admin')
with check(public.current_app_role()='super_admin');
create policy commission_rule_events_insert_super_admin on public.commission_rule_events
for insert to authenticated with check(public.current_app_role()='super_admin');
grant select,insert,update on public.commission_rules to authenticated;
grant select,insert on public.commission_rule_events to authenticated;

create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security invoker set search_path=''
as $$ select exists(select 1 from public.role_permissions rp where rp.role=public.current_app_role() and rp.permission=p_permission); $$;
revoke all on function public.has_permission(text) from public,anon;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.calculate_delivery_split(p_delivery_fee_iqd bigint)
returns table(platform_fee_iqd bigint,captain_fee_iqd bigint)
language plpgsql stable security invoker set search_path=''
as $$
declare v_bps integer;v_platform bigint;
begin
 if p_delivery_fee_iqd is null or p_delivery_fee_iqd<0 then raise exception 'invalid_delivery_fee' using errcode='22023'; end if;
 select cr.basis_points into v_bps from public.commission_rules cr
 where cr.scope_type='platform' and cr.store_id is null and cr.charge_type='delivery_platform'
 and cr.is_active=true and cr.effective_from<=now() and (cr.effective_to is null or cr.effective_to>now())
 order by cr.effective_from desc limit 1;
 if v_bps is null then raise exception 'delivery_commission_rule_missing' using errcode='P0002'; end if;
 v_platform:=round((p_delivery_fee_iqd::numeric*v_bps::numeric)/10000)::bigint;
 return query select v_platform,(p_delivery_fee_iqd-v_platform);
end;
$$;
revoke all on function public.calculate_delivery_split(bigint) from public,anon;
grant execute on function public.calculate_delivery_split(bigint) to authenticated;

create or replace function public.calculate_merchant_commission(p_store_id uuid,p_weight_kg numeric,p_goods_subtotal_iqd bigint)
returns bigint language plpgsql stable security invoker set search_path=''
as $$
declare v_rule public.commission_rules%rowtype;v_value bigint;
begin
 if p_goods_subtotal_iqd is null or p_goods_subtotal_iqd<0 then raise exception 'invalid_goods_subtotal' using errcode='22023'; end if;
 select * into v_rule from public.commission_rules cr
 where cr.charge_type='merchant' and cr.is_active=true and cr.effective_from<=now()
 and (cr.effective_to is null or cr.effective_to>now())
 and ((cr.scope_type='store' and cr.store_id=p_store_id) or (cr.scope_type='platform' and cr.store_id is null))
 order by case when cr.scope_type='store' then 0 else 1 end,cr.effective_from desc limit 1;
 if not found then raise exception 'merchant_commission_rule_missing' using errcode='P0002'; end if;
 if v_rule.calculation_method='fixed_per_kg' then
  if p_weight_kg is null or p_weight_kg<0 then raise exception 'weight_required_for_commission' using errcode='22023'; end if;
  v_value:=ceil(p_weight_kg*v_rule.amount_iqd)::bigint;
 elsif v_rule.calculation_method='percentage' then
  v_value:=ceil((p_goods_subtotal_iqd::numeric*v_rule.basis_points::numeric)/10000)::bigint;
 else v_value:=v_rule.amount_iqd; end if;
 return v_value;
end;
$$;
revoke all on function public.calculate_merchant_commission(uuid,numeric,bigint) from public,anon;
grant execute on function public.calculate_merchant_commission(uuid,numeric,bigint) to authenticated;

create or replace function public.set_commission_rule(p_scope_type text,p_store_id uuid,p_charge_type text,
 p_calculation_method text,p_calculation_basis text,p_amount_iqd bigint,p_basis_points integer,p_reason text)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_actor uuid:=auth.uid();v_reason text:=btrim(coalesce(p_reason,''));v_old jsonb;v_rule_id uuid;v_new jsonb;
begin
 if v_actor is null or public.current_app_role()<>'super_admin' then raise exception 'super_admin_required' using errcode='42501'; end if;
 if char_length(v_reason)<2 or char_length(v_reason)>1200 then raise exception 'invalid_commission_rule_reason' using errcode='22023'; end if;
 if p_scope_type not in ('platform','store') or p_charge_type not in ('merchant','delivery_platform') then raise exception 'invalid_commission_rule_scope' using errcode='22023'; end if;
 if (p_scope_type='platform' and p_store_id is not null) or (p_scope_type='store' and p_store_id is null) then raise exception 'invalid_commission_rule_store_scope' using errcode='22023'; end if;
 if p_scope_type='store' and not exists(select 1 from public.stores s where s.id=p_store_id and s.is_platform_store=false) then raise exception 'merchant_store_not_found' using errcode='P0002'; end if;
 if p_charge_type='delivery_platform' and (p_scope_type<>'platform' or p_calculation_method<>'percentage' or p_calculation_basis<>'delivery_fee' or p_amount_iqd is not null or p_basis_points is null or p_basis_points not between 0 and 10000) then raise exception 'invalid_delivery_commission_rule' using errcode='22023'; end if;
 if p_charge_type='merchant' and not (
 (p_calculation_method='fixed_per_kg' and p_calculation_basis='weight_kg' and p_amount_iqd is not null and p_amount_iqd>=0 and p_basis_points is null)
 or (p_calculation_method='percentage' and p_calculation_basis in ('goods_subtotal','order_subtotal') and p_amount_iqd is null and p_basis_points between 0 and 10000)
 or (p_calculation_method='fixed_per_order' and p_calculation_basis='order_subtotal' and p_amount_iqd is not null and p_amount_iqd>=0 and p_basis_points is null)
 ) then raise exception 'invalid_merchant_commission_rule' using errcode='22023'; end if;
 select to_jsonb(cr) into v_old from public.commission_rules cr where cr.is_active=true and cr.charge_type=p_charge_type
 and ((p_scope_type='platform' and cr.scope_type='platform' and cr.store_id is null) or (p_scope_type='store' and cr.scope_type='store' and cr.store_id=p_store_id)) for update;
 update public.commission_rules cr set is_active=false,effective_to=now() where cr.is_active=true and cr.charge_type=p_charge_type
 and ((p_scope_type='platform' and cr.scope_type='platform' and cr.store_id is null) or (p_scope_type='store' and cr.scope_type='store' and cr.store_id=p_store_id));
 insert into public.commission_rules(rule_key,scope_type,store_id,charge_type,calculation_method,calculation_basis,amount_iqd,basis_points,is_active,created_by)
 values(p_charge_type||'-'||p_scope_type||'-'||coalesce(p_store_id::text,'global')||'-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),
 p_scope_type,p_store_id,p_charge_type,p_calculation_method,p_calculation_basis,p_amount_iqd,p_basis_points,true,v_actor)
 returning id into v_rule_id;
 select to_jsonb(cr) into v_new from public.commission_rules cr where cr.id=v_rule_id;
 insert into public.commission_rule_events(rule_id,actor_user_id,event_type,previous_values,new_values,reason)
 values(v_rule_id,v_actor,case when v_old is null then 'created' else 'replaced' end,v_old,v_new,v_reason);
 return v_rule_id;
end;
$$;
revoke all on function public.set_commission_rule(text,uuid,text,text,text,bigint,integer,text) from public,anon;
grant execute on function public.set_commission_rule(text,uuid,text,text,text,bigint,integer,text) to authenticated;

create index commission_rule_events_actor_idx on public.commission_rule_events(actor_user_id);
create index commission_rule_events_rule_idx on public.commission_rule_events(rule_id);
create index commission_rules_created_by_idx on public.commission_rules(created_by);
create index delivery_assignments_merchant_idx on public.delivery_assignments(merchant_user_id);
create index delivery_assignments_order_idx on public.delivery_assignments(order_id);
create index delivery_location_updates_captain_idx on public.delivery_location_updates(captain_user_id);
create index delivery_location_updates_customer_idx on public.delivery_location_updates(customer_id);
create index delivery_location_updates_order_idx on public.delivery_location_updates(order_id);
create index order_items_customer_idx on public.order_items(customer_id);
create index order_items_product_idx on public.order_items(product_id);
create index order_items_store_idx on public.order_items(store_id);
create index order_status_events_actor_idx on public.order_status_events(actor_user_id);
create index order_status_events_customer_idx on public.order_status_events(customer_id);
create index order_status_events_merchant_idx on public.order_status_events(merchant_user_id);
create index order_status_events_order_store_idx on public.order_status_events(order_store_id);
create index orders_address_idx on public.orders(address_id);
create index orders_delivery_zone_idx on public.orders(delivery_zone_id);
create index role_assignment_events_new_role_idx on public.role_assignment_events(new_role);
create index role_assignment_events_previous_role_idx on public.role_assignment_events(previous_role);
create index role_permissions_permission_idx on public.role_permissions(permission);
create index wallet_ledger_entries_store_idx on public.wallet_ledger_entries(store_id);
create index wallet_transactions_created_by_idx on public.wallet_transactions(created_by_user_id);

alter table public.commission_rules drop constraint commission_rule_value;
alter table public.commission_rules add constraint commission_rule_value check(
 (calculation_method in ('fixed_per_kg','fixed_per_order') and amount_iqd is not null and amount_iqd>=0 and basis_points is null)
 or (calculation_method='percentage' and amount_iqd is null and basis_points is not null and basis_points between 0 and 10000)
);

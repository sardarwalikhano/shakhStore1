-- M08: prepaid wallets, append-only double-entry ledger and commission rules.
create table public.wallet_accounts (
 id uuid primary key default gen_random_uuid(), account_key text not null unique,
 account_type text not null check(account_type in ('customer','merchant','captain','platform')),
 user_id uuid references auth.users(id) on delete restrict,
 store_id uuid references public.stores(id) on delete restrict,
 status text not null default 'active' check(status in ('active','frozen','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint wallet_accounts_owner_scope check(
  (account_type in ('customer','captain') and user_id is not null and store_id is null)
  or (account_type='merchant' and user_id is not null and store_id is not null)
  or (account_type='platform' and user_id is null and store_id is null)
 )
);
create unique index wallet_customer_account_per_user_idx on public.wallet_accounts(user_id) where account_type='customer';
create unique index wallet_captain_account_per_user_idx on public.wallet_accounts(user_id) where account_type='captain';
create unique index wallet_merchant_account_per_store_idx on public.wallet_accounts(store_id) where account_type='merchant';
create unique index wallet_single_platform_account_idx on public.wallet_accounts(account_type) where account_type='platform';
create index wallet_accounts_user_type_idx on public.wallet_accounts(user_id,account_type);

create table public.wallet_transactions (
 id uuid primary key default gen_random_uuid(), idempotency_key text not null unique,
 transaction_type text not null check(transaction_type in ('top_up','order_payment','order_refund','merchant_commission','captain_earning','delivery_platform_commission','payout','adjustment','transfer','reversal')),
 status text not null default 'pending' check(status in ('pending','posted','failed','reversed')),
 amount_iqd bigint not null check(amount_iqd>0), currency text not null default 'IQD' check(currency='IQD'),
 owner_user_id uuid references auth.users(id) on delete restrict,
 source_order_id uuid references public.orders(id) on delete restrict,
 external_reference text, created_by_user_id uuid references auth.users(id) on delete set null,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), posted_at timestamptz,
 constraint wallet_transaction_posted_at_state check((status='posted' and posted_at is not null) or (status<>'posted' and posted_at is null)),
 constraint wallet_transaction_idempotency_length check(char_length(idempotency_key) between 8 and 200)
);
create index wallet_transactions_owner_created_idx on public.wallet_transactions(owner_user_id,created_at desc);
create index wallet_transactions_order_idx on public.wallet_transactions(source_order_id);

create table public.wallet_ledger_entries (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references public.wallet_transactions(id) on delete restrict,
 wallet_account_id uuid not null references public.wallet_accounts(id) on delete restrict,
 owner_user_id uuid references auth.users(id) on delete restrict,
 store_id uuid references public.stores(id) on delete restrict,
 entry_type text not null check(entry_type in ('debit','credit')),
 amount_iqd bigint not null check(amount_iqd>0), memo text,
 created_at timestamptz not null default now(),
 constraint wallet_entries_memo_length check(memo is null or char_length(memo)<=500)
);
create index wallet_ledger_entries_account_created_idx on public.wallet_ledger_entries(wallet_account_id,created_at desc);
create index wallet_ledger_entries_owner_created_idx on public.wallet_ledger_entries(owner_user_id,created_at desc);
create index wallet_ledger_entries_transaction_idx on public.wallet_ledger_entries(transaction_id);

create or replace function private.prevent_wallet_ledger_mutation()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'wallet_ledger_is_append_only' using errcode='55000'; end; $$;
revoke all on function private.prevent_wallet_ledger_mutation() from public,anon,authenticated;
create trigger wallet_ledger_entries_immutable before update or delete on public.wallet_ledger_entries
for each row execute function private.prevent_wallet_ledger_mutation();

create table public.commission_rules (
 id uuid primary key default gen_random_uuid(), rule_key text not null,
 scope_type text not null check(scope_type in ('platform','store')),
 store_id uuid references public.stores(id) on delete restrict,
 charge_type text not null check(charge_type in ('merchant','delivery_platform')),
 calculation_method text not null check(calculation_method in ('fixed_per_kg','percentage','fixed_per_order')),
 calculation_basis text not null check(calculation_basis in ('weight_kg','goods_subtotal','order_subtotal','delivery_fee')),
 amount_iqd bigint,basis_points integer,is_active boolean not null default true,
 effective_from timestamptz not null default now(),effective_to timestamptz,
 created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),
 constraint commission_rule_scope_store check((scope_type='platform' and store_id is null) or (scope_type='store' and store_id is not null)),
 constraint commission_rule_value check(
  (calculation_method in ('fixed_per_kg','fixed_per_order') and amount_iqd is not null and amount_iqd>=0 and basis_points is null)
  or (calculation_method='percentage' and amount_iqd is null and basis_points between 0 and 10000)
 ),
 constraint commission_rule_effective_window check(effective_to is null or effective_to>effective_from),
 constraint delivery_commission_basis check(charge_type<>'delivery_platform' or (calculation_method='percentage' and calculation_basis='delivery_fee')),
 constraint merchant_commission_basis check(
  charge_type<>'merchant'
  or (calculation_method='fixed_per_kg' and calculation_basis='weight_kg')
  or (calculation_method='percentage' and calculation_basis in ('goods_subtotal','order_subtotal'))
  or (calculation_method='fixed_per_order' and calculation_basis='order_subtotal')
 )
);
create unique index commission_rule_global_active_idx on public.commission_rules(charge_type) where scope_type='platform' and store_id is null and is_active=true;
create unique index commission_rule_store_active_idx on public.commission_rules(store_id,charge_type) where scope_type='store' and is_active=true;
create index commission_rules_store_history_idx on public.commission_rules(store_id,created_at desc);

create table public.commission_rule_events (
 id uuid primary key default gen_random_uuid(),
 rule_id uuid not null references public.commission_rules(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 event_type text not null check(event_type in ('created','replaced','deactivated')),
 previous_values jsonb,new_values jsonb,
 reason text not null check(char_length(reason) between 2 and 1200),
 created_at timestamptz not null default now()
);
create index commission_rule_events_created_idx on public.commission_rule_events(created_at desc);

insert into public.commission_rules(rule_key,scope_type,store_id,charge_type,calculation_method,calculation_basis,amount_iqd,basis_points,is_active)
values
 ('merchant-default-per-kg','platform',null,'merchant','fixed_per_kg','weight_kg',350,null,true),
 ('delivery-platform-share','platform',null,'delivery_platform','percentage','delivery_fee',null,2000,true)
on conflict do nothing;
insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
values('platform-main','platform',null,null,'active') on conflict(account_key) do nothing;

alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_ledger_entries enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commission_rule_events enable row level security;

create policy wallet_accounts_select_owner_or_admin on public.wallet_accounts for select to authenticated
using(user_id=(select auth.uid()) or public.current_app_role() in ('admin','super_admin'));
create policy wallet_transactions_select_owner_or_admin on public.wallet_transactions for select to authenticated
using(owner_user_id=(select auth.uid()) or public.current_app_role() in ('admin','super_admin'));
create policy wallet_ledger_entries_select_owner_or_admin on public.wallet_ledger_entries for select to authenticated
using(owner_user_id=(select auth.uid()) or public.current_app_role() in ('admin','super_admin'));
create policy commission_rules_select_admin on public.commission_rules for select to authenticated
using(public.current_app_role() in ('admin','super_admin'));
create policy commission_rule_events_select_super_admin on public.commission_rule_events for select to authenticated
using(public.current_app_role()='super_admin');
revoke all privileges on public.wallet_accounts,public.wallet_transactions,public.wallet_ledger_entries,public.commission_rules,public.commission_rule_events from anon,authenticated;
grant select on public.wallet_accounts,public.wallet_transactions,public.wallet_ledger_entries,public.commission_rules,public.commission_rule_events to authenticated;
grant all privileges on public.wallet_accounts,public.wallet_transactions,public.wallet_ledger_entries,public.commission_rules,public.commission_rule_events to service_role;

create or replace view public.wallet_balances with (security_invoker=true) as
select wa.id as wallet_account_id,wa.account_key,wa.account_type,wa.user_id,wa.store_id,wa.status,
 coalesce(sum(case when e.entry_type='credit' then e.amount_iqd else -e.amount_iqd end),0)::bigint as balance_iqd,
 count(e.id)::bigint as ledger_entry_count
from public.wallet_accounts wa left join public.wallet_ledger_entries e on e.wallet_account_id=wa.id
group by wa.id,wa.account_key,wa.account_type,wa.user_id,wa.store_id,wa.status;
revoke all on public.wallet_balances from anon;
grant select on public.wallet_balances to authenticated,service_role;

create or replace function public.calculate_delivery_split(p_delivery_fee_iqd bigint)
returns table(platform_fee_iqd bigint,captain_fee_iqd bigint)
language plpgsql stable security definer set search_path=''
as $$
declare v_bps integer; v_platform bigint;
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
returns bigint language plpgsql stable security definer set search_path=''
as $$
declare v_rule public.commission_rules%rowtype; v_value bigint;
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
 else v_value:=v_rule.amount_iqd;
 end if;
 return v_value;
end;
$$;
revoke all on function public.calculate_merchant_commission(uuid,numeric,bigint) from public,anon;
grant execute on function public.calculate_merchant_commission(uuid,numeric,bigint) to authenticated;

create or replace function public.set_commission_rule(p_scope_type text,p_store_id uuid,p_charge_type text,
 p_calculation_method text,p_calculation_basis text,p_amount_iqd bigint,p_basis_points integer,p_reason text)
returns uuid language plpgsql security definer set search_path=''
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
 values(p_charge_type||'-'||p_scope_type||'-'||coalesce(p_store_id::text,'global')||'-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),p_scope_type,p_store_id,p_charge_type,p_calculation_method,p_calculation_basis,p_amount_iqd,p_basis_points,true,v_actor)
 returning id into v_rule_id;
 select to_jsonb(cr) into v_new from public.commission_rules cr where cr.id=v_rule_id;
 insert into public.commission_rule_events(rule_id,actor_user_id,event_type,previous_values,new_values,reason)
 values(v_rule_id,v_actor,case when v_old is null then 'created' else 'replaced' end,v_old,v_new,v_reason);
 return v_rule_id;
end;
$$;
revoke all on function public.set_commission_rule(text,uuid,text,text,text,bigint,integer,text) from public,anon;
grant execute on function public.set_commission_rule(text,uuid,text,text,text,bigint,integer,text) to authenticated;

create or replace function public.post_wallet_transaction(p_transaction_id uuid,p_entries jsonb)
returns table(transaction_id uuid,status text,total_debits_iqd bigint)
language plpgsql security invoker set search_path=''
as $$
declare v_tx public.wallet_transactions%rowtype;v_debits numeric;v_credits numeric;v_count integer;
begin
 if current_user not in ('service_role','postgres') then raise exception 'backend_wallet_posting_only' using errcode='42501'; end if;
 if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)<2 then raise exception 'at_least_two_ledger_entries_required' using errcode='22023'; end if;
 select * into v_tx from public.wallet_transactions where id=p_transaction_id for update;
 if not found then raise exception 'wallet_transaction_not_found' using errcode='P0002'; end if;
 if v_tx.status<>'pending' then raise exception 'wallet_transaction_not_pending' using errcode='P0001'; end if;
 select coalesce(sum(e.amount_iqd) filter(where e.entry_type='debit'),0),coalesce(sum(e.amount_iqd) filter(where e.entry_type='credit'),0),count(*)
 into v_debits,v_credits,v_count from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text);
 if v_count<>jsonb_array_length(p_entries) or exists(select 1 from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text) where e.wallet_account_id is null or e.entry_type not in ('debit','credit') or e.amount_iqd is null or e.amount_iqd<=0) then raise exception 'invalid_wallet_ledger_entry' using errcode='22023'; end if;
 if v_debits=0 or v_debits<>v_credits or v_debits<>v_tx.amount_iqd then raise exception 'wallet_transaction_not_balanced' using errcode='23514'; end if;
 perform 1 from public.wallet_accounts wa where wa.id in(select e.wallet_account_id from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)) order by wa.id for update;
 if exists(select 1 from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text) left join public.wallet_accounts wa on wa.id=e.wallet_account_id where wa.id is null or wa.status<>'active') then raise exception 'wallet_account_missing_or_inactive' using errcode='P0002'; end if;
 if exists(select 1 from(select e.wallet_account_id,sum(e.amount_iqd) as debit_amount from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text) where e.entry_type='debit' group by e.wallet_account_id) d join public.wallet_accounts wa on wa.id=d.wallet_account_id left join public.wallet_ledger_entries le on le.wallet_account_id=wa.id group by d.wallet_account_id,d.debit_amount,wa.account_type having wa.account_type<>'platform' and coalesce(sum(case when le.entry_type='credit' then le.amount_iqd else -le.amount_iqd end),0)<d.debit_amount) then raise exception 'insufficient_wallet_balance' using errcode='23514'; end if;
 insert into public.wallet_ledger_entries(transaction_id,wallet_account_id,owner_user_id,store_id,entry_type,amount_iqd,memo)
 select p_transaction_id,wa.id,wa.user_id,wa.store_id,e.entry_type,e.amount_iqd,e.memo from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text) join public.wallet_accounts wa on wa.id=e.wallet_account_id;
 update public.wallet_transactions set status='posted',posted_at=now() where id=p_transaction_id;
 return query select p_transaction_id,'posted'::text,v_debits::bigint;
end;
$$;
revoke all on function public.post_wallet_transaction(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.post_wallet_transaction(uuid,jsonb) to service_role;

create or replace function private.create_customer_wallet()
returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.wallet_accounts(account_key,account_type,user_id,status) values('customer:'||new.id::text,'customer',new.id,'active') on conflict do nothing; return new; end; $$;
revoke all on function private.create_customer_wallet() from public,anon,authenticated;
create trigger on_auth_user_customer_wallet after insert on auth.users for each row execute function private.create_customer_wallet();

create or replace function private.create_merchant_wallet()
returns trigger language plpgsql security definer set search_path=''
as $$ begin if new.is_platform_store=false and new.owner_id is not null then insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status) values('merchant:'||new.id::text,'merchant',new.owner_id,new.id,'active') on conflict do nothing; end if; return new; end; $$;
revoke all on function private.create_merchant_wallet() from public,anon,authenticated;
create trigger on_store_create_merchant_wallet after insert on public.stores for each row execute function private.create_merchant_wallet();

create or replace function private.sync_captain_wallet()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_old_role text;v_new_role text;
begin
 v_old_role:=coalesce(old.raw_app_meta_data->>'role','');v_new_role:=coalesce(new.raw_app_meta_data->>'role','');
 if v_old_role is distinct from v_new_role then
  if v_new_role='captain' then insert into public.wallet_accounts(account_key,account_type,user_id,status) values('captain:'||new.id::text,'captain',new.id,'active') on conflict do nothing;
  elsif v_old_role='captain' then update public.wallet_accounts set status='frozen' where account_type='captain' and user_id=new.id and status='active'; end if;
 end if; return new;
end; $$;
revoke all on function private.sync_captain_wallet() from public,anon,authenticated;
create trigger on_auth_user_role_wallet_sync after update of raw_app_meta_data on auth.users for each row execute function private.sync_captain_wallet();

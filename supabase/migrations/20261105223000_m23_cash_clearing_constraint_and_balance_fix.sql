-- M23: correct COD clearing-account constraints and debit-normal balance handling.
-- M08 names the owner-scope constraint wallet_accounts_owner_scope (without _check).
-- M22's first attempt therefore left the original restrictive constraint in place.
alter table public.wallet_accounts
  drop constraint if exists wallet_accounts_owner_scope,
  drop constraint if exists wallet_accounts_owner_scope_check,
  drop constraint if exists wallet_accounts_account_type_check;

alter table public.wallet_accounts
  add constraint wallet_accounts_account_type_check
    check (account_type in ('customer','merchant','captain','platform','cash_clearing')),
  add constraint wallet_accounts_owner_scope
    check (
      (account_type in ('customer','captain') and user_id is not null and store_id is null)
      or (account_type='merchant' and user_id is not null and store_id is not null)
      or (account_type in ('platform','cash_clearing') and user_id is null and store_id is null)
    );

-- Cash clearing is debit-normal (cash receivable from the captain), unlike
-- customer/merchant/captain/platform wallets which are credit-normal.
create or replace view public.wallet_balances
with (security_invoker=true) as
select
  wa.id as wallet_account_id,
  wa.account_key,
  wa.account_type,
  wa.user_id,
  wa.store_id,
  wa.status,
  coalesce(sum(
    case
      when wa.account_type='cash_clearing' and e.entry_type='debit' then e.amount_iqd
      when wa.account_type='cash_clearing' and e.entry_type='credit' then -e.amount_iqd
      when wa.account_type<>'cash_clearing' and e.entry_type='credit' then e.amount_iqd
      else -e.amount_iqd
    end
  ),0)::bigint as balance_iqd,
  count(e.id)::bigint as ledger_entry_count
from public.wallet_accounts wa
left join public.wallet_ledger_entries e on e.wallet_account_id=wa.id
group by wa.id,wa.account_key,wa.account_type,wa.user_id,wa.store_id,wa.status;

revoke all on public.wallet_balances from anon;
grant select on public.wallet_balances to authenticated,service_role;

-- Permit debits from the COD cash-clearing asset account even when its balance
-- starts at zero; retain insufficient-funds protection for spendable wallets.
create or replace function public.post_wallet_transaction(p_transaction_id uuid,p_entries jsonb)
returns table(transaction_id uuid,status text,total_debits_iqd bigint)
language plpgsql security invoker set search_path=''
as $$
declare
 v_tx public.wallet_transactions%rowtype;
 v_debits numeric;
 v_credits numeric;
 v_count integer;
begin
 if current_user not in ('service_role','postgres') then
  raise exception 'backend_wallet_posting_only' using errcode='42501';
 end if;
 if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)<2 then
  raise exception 'at_least_two_ledger_entries_required' using errcode='22023';
 end if;
 select * into v_tx from public.wallet_transactions where id=p_transaction_id for update;
 if not found then raise exception 'wallet_transaction_not_found' using errcode='P0002'; end if;
 if v_tx.status<>'pending' then raise exception 'wallet_transaction_not_pending' using errcode='P0001'; end if;
 select
  coalesce(sum(e.amount_iqd) filter(where e.entry_type='debit'),0),
  coalesce(sum(e.amount_iqd) filter(where e.entry_type='credit'),0),
  count(*)
 into v_debits,v_credits,v_count
 from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text);
 if v_count<>jsonb_array_length(p_entries) or exists(
  select 1 from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)
  where e.wallet_account_id is null or e.entry_type not in ('debit','credit') or e.amount_iqd is null or e.amount_iqd<=0
 ) then raise exception 'invalid_wallet_ledger_entry' using errcode='22023'; end if;
 if v_debits=0 or v_debits<>v_credits or v_debits<>v_tx.amount_iqd then
  raise exception 'wallet_transaction_not_balanced' using errcode='23514';
 end if;
 perform 1 from public.wallet_accounts wa
 where wa.id in(
  select e.wallet_account_id from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)
 )
 order by wa.id for update;
 if exists(
  select 1
  from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)
  left join public.wallet_accounts wa on wa.id=e.wallet_account_id
  where wa.id is null or wa.status<>'active'
 ) then raise exception 'wallet_account_missing_or_inactive' using errcode='P0002'; end if;
 if exists(
  select 1
  from (
   select e.wallet_account_id,sum(e.amount_iqd) as debit_amount
   from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)
   where e.entry_type='debit'
   group by e.wallet_account_id
  ) d
  join public.wallet_accounts wa on wa.id=d.wallet_account_id
  left join public.wallet_ledger_entries le on le.wallet_account_id=wa.id
  group by d.wallet_account_id,d.debit_amount,wa.account_type
  having wa.account_type not in ('platform','cash_clearing')
   and coalesce(sum(case when le.entry_type='credit' then le.amount_iqd else -le.amount_iqd end),0)<d.debit_amount
 ) then raise exception 'insufficient_wallet_balance' using errcode='23514'; end if;
 insert into public.wallet_ledger_entries(transaction_id,wallet_account_id,owner_user_id,store_id,entry_type,amount_iqd,memo)
 select p_transaction_id,wa.id,wa.user_id,wa.store_id,e.entry_type,e.amount_iqd,e.memo
 from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)
 join public.wallet_accounts wa on wa.id=e.wallet_account_id;
 update public.wallet_transactions set status='posted',posted_at=now() where id=p_transaction_id;
 return query select p_transaction_id,'posted'::text,v_debits::bigint;
end;
$$;
revoke all on function public.post_wallet_transaction(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.post_wallet_transaction(uuid,jsonb) to service_role;

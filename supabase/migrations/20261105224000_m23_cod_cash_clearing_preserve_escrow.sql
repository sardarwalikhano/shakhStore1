-- M23: introduce a debit-normal COD cash-clearing account without changing existing escrow accounts.
-- COD collection debits cash receivable and credits merchant proceeds, captain earnings,
-- and platform commission. Physical cash remittance reconciliation is a separate workflow.

alter table public.wallet_accounts
  drop constraint if exists wallet_accounts_account_type_check,
  drop constraint if exists wallet_accounts_owner_scope;

alter table public.wallet_accounts
  add constraint wallet_accounts_account_type_check
    check (account_type in ('customer','merchant','captain','platform','escrow','cash_clearing')),
  add constraint wallet_accounts_owner_scope
    check (
      (account_type in ('customer','captain') and user_id is not null and store_id is null)
      or (account_type='merchant' and user_id is not null and store_id is not null)
      or (account_type in ('platform','escrow','cash_clearing') and user_id is null and store_id is null)
    );

create unique index if not exists wallet_single_cash_clearing_account_idx
  on public.wallet_accounts(account_type)
  where account_type='cash_clearing';

insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
values ('cash-clearing:delivery','cash_clearing',null,null,'active')
on conflict (account_key) do nothing;

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

create or replace function public.post_wallet_transaction(p_transaction_id uuid,p_entries jsonb)
returns table(transaction_id uuid,status text,total_debits_iqd bigint)
language plpgsql
set search_path=''
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
    where e.wallet_account_id is null or e.entry_type not in ('debit','credit')
      or e.amount_iqd is null or e.amount_iqd<=0
  ) then
    raise exception 'invalid_wallet_ledger_entry' using errcode='22023';
  end if;
  if v_debits=0 or v_debits<>v_credits or v_debits<>v_tx.amount_iqd then
    raise exception 'wallet_transaction_not_balanced' using errcode='23514';
  end if;

  perform 1 from public.wallet_accounts wa
  where wa.id in (
    select e.wallet_account_id from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)
  )
  order by wa.id for update;

  if exists(
    select 1 from jsonb_to_recordset(p_entries) as e(wallet_account_id uuid,entry_type text,amount_iqd bigint,memo text)
    left join public.wallet_accounts wa on wa.id=e.wallet_account_id
    where wa.id is null or wa.status<>'active'
  ) then
    raise exception 'wallet_account_missing_or_inactive' using errcode='P0002';
  end if;

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
  ) then
    raise exception 'insufficient_wallet_balance' using errcode='23514';
  end if;

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

create or replace function public.captain_confirm_cod_collection_v1(
  p_assignment_id uuid,
  p_cash_received_iqd bigint,
  p_receipt_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment public.delivery_assignments%rowtype;
  v_order public.orders%rowtype;
  v_order_store public.order_stores%rowtype;
  v_platform_wallet_id uuid;
  v_cash_clearing_wallet_id uuid;
  v_merchant_wallet_id uuid;
  v_captain_wallet_id uuid;
  v_transaction_id uuid;
  v_delivery_share bigint := 0;
  v_expected_cash bigint := 0;
  v_merchant_commission bigint := 0;
  v_merchant_net bigint := 0;
  v_delivery_platform_fee bigint := 0;
  v_captain_fee bigint := 0;
  v_platform_credit bigint := 0;
  v_entries jsonb;
  v_receipt text := nullif(pg_catalog.btrim(coalesce(p_receipt_reference,'')),'');
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if public.current_app_role() is distinct from 'captain' then raise exception 'CAPTAIN_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_cash_received_iqd is null or p_cash_received_iqd <= 0 then raise exception 'INVALID_CASH_AMOUNT' using errcode='22023'; end if;
  if v_receipt is not null and char_length(v_receipt)>160 then raise exception 'RECEIPT_REFERENCE_TOO_LONG' using errcode='22023'; end if;

  select da.* into v_assignment from public.delivery_assignments da where da.id=p_assignment_id for update;
  if not found then raise exception 'DELIVERY_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
  if v_assignment.captain_user_id is distinct from v_user_id then raise exception 'DELIVERY_NOT_ASSIGNED_TO_CAPTAIN' using errcode='42501'; end if;
  if v_assignment.cod_transaction_id is not null then
    return pg_catalog.jsonb_build_object('assignment_id',v_assignment.id,'transaction_id',v_assignment.cod_transaction_id,'cash_received_iqd',v_assignment.cod_collected_iqd,'idempotent_replay',true);
  end if;
  if v_assignment.status <> 'delivered' then raise exception 'DELIVERY_MUST_BE_DELIVERED_BEFORE_COD_COLLECTION' using errcode='P0001'; end if;

  select o.* into v_order from public.orders o where o.id=v_assignment.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.payment_method <> 'cash_on_delivery' then raise exception 'ORDER_IS_NOT_CASH_ON_DELIVERY' using errcode='22023'; end if;
  if v_order.payment_status <> 'pending' then raise exception 'ORDER_PAYMENT_NOT_PENDING' using errcode='P0001'; end if;

  select os.* into v_order_store from public.order_stores os
  where os.id=v_assignment.order_store_id and os.order_id=v_order.id for update;
  if not found then raise exception 'ORDER_STORE_NOT_FOUND' using errcode='P0002'; end if;

  select allocation.delivery_share_iqd into v_delivery_share
  from (
    select os.id,
      case
        when row_number() over(order by os.created_at,os.id)=count(*) over() then
          v_order.delivery_fee_iqd-coalesce(sum(
            case when v_order.items_subtotal_iqd>0
              then round(v_order.delivery_fee_iqd::numeric*os.items_subtotal_iqd/v_order.items_subtotal_iqd)::bigint
              else 0 end
          ) over(order by os.created_at,os.id rows between unbounded preceding and 1 preceding),0)
        when v_order.items_subtotal_iqd>0
          then round(v_order.delivery_fee_iqd::numeric*os.items_subtotal_iqd/v_order.items_subtotal_iqd)::bigint
        else 0
      end as delivery_share_iqd
    from public.order_stores os where os.order_id=v_order.id
  ) allocation where allocation.id=v_order_store.id;

  v_delivery_share:=coalesce(v_delivery_share,0);
  v_expected_cash:=v_order_store.items_subtotal_iqd+v_delivery_share;
  if p_cash_received_iqd<>v_expected_cash then
    raise exception 'COD_AMOUNT_MISMATCH: expected %, received %',v_expected_cash,p_cash_received_iqd using errcode='22023';
  end if;

  v_merchant_commission:=least(greatest(v_order_store.merchant_commission_iqd,0),v_order_store.items_subtotal_iqd);
  v_merchant_net:=v_order_store.items_subtotal_iqd-v_merchant_commission;
  select split.platform_fee_iqd,split.captain_fee_iqd into v_delivery_platform_fee,v_captain_fee
  from public.calculate_delivery_split(v_delivery_share) split;
  v_platform_credit:=v_merchant_commission+v_delivery_platform_fee;

  insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
  values('merchant:'||v_order_store.store_id::text,'merchant',v_order_store.merchant_user_id,v_order_store.store_id,'active')
  on conflict(account_key) do nothing;
  insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
  values('captain:'||v_user_id::text,'captain',v_user_id,null,'active')
  on conflict(account_key) do nothing;

  select wa.id into v_platform_wallet_id from public.wallet_accounts wa
  where wa.account_key='platform-main' and wa.account_type='platform' and wa.status='active';
  select wa.id into v_cash_clearing_wallet_id from public.wallet_accounts wa
  where wa.account_key='cash-clearing:delivery' and wa.account_type='cash_clearing' and wa.status='active';
  select wa.id into v_merchant_wallet_id from public.wallet_accounts wa
  where wa.account_key='merchant:'||v_order_store.store_id::text and wa.account_type='merchant' and wa.status='active';
  select wa.id into v_captain_wallet_id from public.wallet_accounts wa
  where wa.account_key='captain:'||v_user_id::text and wa.account_type='captain' and wa.status='active';
  if v_platform_wallet_id is null then raise exception 'PLATFORM_WALLET_NOT_ACTIVE' using errcode='P0002'; end if;
  if v_cash_clearing_wallet_id is null then raise exception 'COD_CASH_CLEARING_WALLET_NOT_ACTIVE' using errcode='P0002'; end if;
  if v_merchant_wallet_id is null then raise exception 'MERCHANT_WALLET_NOT_ACTIVE' using errcode='P0002'; end if;
  if v_captain_wallet_id is null then raise exception 'CAPTAIN_WALLET_NOT_ACTIVE' using errcode='P0002'; end if;

  v_entries:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'wallet_account_id',v_cash_clearing_wallet_id,'entry_type','debit','amount_iqd',v_expected_cash,
    'memo','COD cash receivable collected by captain for order '||v_order.order_number
  ));
  if v_merchant_net>0 then
    v_entries:=v_entries||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'wallet_account_id',v_merchant_wallet_id,'entry_type','credit','amount_iqd',v_merchant_net,
      'memo','Merchant net proceeds for order '||v_order.order_number
    ));
  end if;
  if v_captain_fee>0 then
    v_entries:=v_entries||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'wallet_account_id',v_captain_wallet_id,'entry_type','credit','amount_iqd',v_captain_fee,
      'memo','Captain delivery earning for order '||v_order.order_number
    ));
  end if;
  if v_platform_credit>0 then
    v_entries:=v_entries||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'wallet_account_id',v_platform_wallet_id,'entry_type','credit','amount_iqd',v_platform_credit,
      'memo','Platform merchant and delivery commission for order '||v_order.order_number
    ));
  end if;

  insert into public.wallet_transactions(
    idempotency_key,transaction_type,status,amount_iqd,currency,owner_user_id,source_order_id,
    external_reference,created_by_user_id,metadata
  )
  values(
    'cod-collection:'||v_assignment.id::text,'order_payment','pending',v_expected_cash,'IQD',
    v_user_id,v_order.id,v_receipt,v_user_id,
    pg_catalog.jsonb_build_object(
      'source','cash_on_delivery','assignment_id',v_assignment.id,'order_store_id',v_order_store.id,
      'goods_subtotal_iqd',v_order_store.items_subtotal_iqd,'delivery_fee_share_iqd',v_delivery_share,
      'merchant_commission_iqd',v_merchant_commission,'merchant_net_iqd',v_merchant_net,
      'delivery_platform_fee_iqd',v_delivery_platform_fee,'captain_fee_iqd',v_captain_fee,'receipt_reference',v_receipt
    )
  )
  returning id into v_transaction_id;

  perform * from public.post_wallet_transaction(v_transaction_id,v_entries);

  update public.delivery_assignments set cod_collected_at=now(),cod_collected_iqd=v_expected_cash,
    cod_receipt_reference=v_receipt,cod_transaction_id=v_transaction_id,updated_at=now()
  where id=v_assignment.id;

  if not exists(select 1 from public.delivery_assignments da where da.order_id=v_order.id and da.cod_collected_at is null) then
    update public.orders set payment_status='paid',updated_at=now()
    where id=v_order.id and payment_status='pending';
  end if;

  return pg_catalog.jsonb_build_object(
    'assignment_id',v_assignment.id,'transaction_id',v_transaction_id,'cash_received_iqd',v_expected_cash,
    'merchant_net_iqd',v_merchant_net,'captain_fee_iqd',v_captain_fee,
    'platform_commission_iqd',v_platform_credit,'idempotent_replay',false
  );
end;
$$;

revoke all on function public.captain_confirm_cod_collection_v1(uuid,bigint,text) from public,anon;
grant execute on function public.captain_confirm_cod_collection_v1(uuid,bigint,text) to authenticated;

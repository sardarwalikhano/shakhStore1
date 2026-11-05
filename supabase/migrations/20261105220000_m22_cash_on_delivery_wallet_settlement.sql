-- M22: account for cash-on-delivery collection without debiting platform funds.
-- The captain collects the full fee in cash. The journal records the cash
-- clearing debit and credits the captain's 80% earning and platform's 20% share.
-- M08 names the original owner constraint wallet_accounts_owner_scope.
alter table public.wallet_accounts
  drop constraint if exists wallet_accounts_account_type_check,
  drop constraint if exists wallet_accounts_owner_scope,
  drop constraint if exists wallet_accounts_owner_scope_check;

alter table public.wallet_accounts
  add constraint wallet_accounts_account_type_check
    check (account_type in ('customer','merchant','captain','platform','cash_clearing')),
  add constraint wallet_accounts_owner_scope
    check (
      (account_type in ('customer','captain') and user_id is not null and store_id is null)
      or (account_type='merchant' and user_id is not null and store_id is not null)
      or (account_type in ('platform','cash_clearing') and user_id is null and store_id is null)
    );

create unique index if not exists wallet_single_cash_clearing_account_idx
  on public.wallet_accounts(account_type)
  where account_type='cash_clearing';

insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
values ('cash-clearing:delivery','cash_clearing',null,null,'active')
on conflict (account_key) do nothing;

create or replace function private.settle_delivered_store_wallets_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.order_stores%rowtype;
  v_captain_wallet uuid;
  v_platform_wallet uuid;
  v_cash_clearing_wallet uuid;
  v_tx_id uuid;
begin
  if new.status is distinct from 'delivered' or old.status='delivered' then
    return new;
  end if;

  select os.* into v_store
  from public.order_stores os
  where os.id=new.order_store_id
  for update;

  if not found then
    raise exception 'ORDER_STORE_NOT_FOUND' using errcode='P0002';
  end if;

  if coalesce(v_store.delivery_fee_iqd,0)=0 then
    return new;
  end if;

  if v_store.captain_delivery_earning_iqd + v_store.delivery_platform_commission_iqd
     <> v_store.delivery_fee_iqd then
    raise exception 'DELIVERY_FEE_SPLIT_MISMATCH' using errcode='23514';
  end if;

  select id into v_captain_wallet
  from public.wallet_accounts
  where account_type='captain'
    and user_id=new.captain_user_id
    and status='active';

  select id into v_platform_wallet
  from public.wallet_accounts
  where account_type='platform' and status='active';

  select id into v_cash_clearing_wallet
  from public.wallet_accounts
  where account_type='cash_clearing' and status='active';

  if v_captain_wallet is null or v_platform_wallet is null
     or v_cash_clearing_wallet is null then
    raise exception 'SETTLEMENT_WALLET_MISSING' using errcode='P0002';
  end if;

  insert into public.wallet_transactions(
    idempotency_key,transaction_type,status,amount_iqd,owner_user_id,
    source_order_id,metadata
  ) values (
    'delivery-settlement:'||new.id::text,'captain_earning','pending',
    v_store.delivery_fee_iqd,new.captain_user_id,new.order_id,
    jsonb_build_object(
      'assignment_id',new.id,
      'order_store_id',new.order_store_id,
      'payment_method','cash_on_delivery',
      'cash_collected_by','captain'
    )
  )
  on conflict(idempotency_key) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    return new;
  end if;

  perform public.post_wallet_transaction(v_tx_id,jsonb_build_array(
    jsonb_build_object(
      'wallet_account_id',v_cash_clearing_wallet,
      'entry_type','debit',
      'amount_iqd',v_store.delivery_fee_iqd,
      'memo','Cash delivery fee collected by captain'
    ),
    jsonb_build_object(
      'wallet_account_id',v_captain_wallet,
      'entry_type','credit',
      'amount_iqd',v_store.captain_delivery_earning_iqd,
      'memo','Captain cash delivery earning (80%)'
    ),
    jsonb_build_object(
      'wallet_account_id',v_platform_wallet,
      'entry_type','credit',
      'amount_iqd',v_store.delivery_platform_commission_iqd,
      'memo','Platform delivery commission (20%)'
    )
  ));

  return new;
end;
$$;

revoke all on function private.settle_delivered_store_wallets_v1() from public,anon,authenticated;
drop trigger if exists settle_delivered_store_wallets_v1 on public.delivery_assignments;
create trigger settle_delivered_store_wallets_v1
after update of status on public.delivery_assignments
for each row execute function private.settle_delivered_store_wallets_v1();

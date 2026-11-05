-- M20: post delivery-fee split to captain/platform wallets exactly once on delivery.
-- Requires checkout to populate order_stores delivery fee snapshots (M17 integration).
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

 -- No settlement when legacy/unintegrated checkout has no fee snapshot.
 if coalesce(v_store.delivery_fee_iqd,0)=0 then
  return new;
 end if;
 if v_store.captain_delivery_earning_iqd + v_store.delivery_platform_commission_iqd
    <> v_store.delivery_fee_iqd then
  raise exception 'DELIVERY_FEE_SPLIT_MISMATCH' using errcode='23514';
 end if;

 select id into v_captain_wallet from public.wallet_accounts
 where account_type='captain' and user_id=new.captain_user_id and status='active';
 select id into v_platform_wallet from public.wallet_accounts
 where account_type='platform' and status='active';
 if v_captain_wallet is null or v_platform_wallet is null then
  raise exception 'SETTLEMENT_WALLET_MISSING' using errcode='P0002';
 end if;

 insert into public.wallet_transactions(
  idempotency_key,transaction_type,status,amount_iqd,owner_user_id,
  source_order_id,metadata
 ) values (
  'delivery-settlement:'||new.id::text,'captain_earning','pending',
  v_store.delivery_fee_iqd,new.captain_user_id,new.order_id,
  jsonb_build_object('assignment_id',new.id,'order_store_id',new.order_store_id)
 ) on conflict(idempotency_key) do nothing
 returning id into v_tx_id;

 if v_tx_id is null then
  return new;
 end if;

 perform public.post_wallet_transaction(v_tx_id,jsonb_build_array(
  jsonb_build_object('wallet_account_id',v_platform_wallet,'entry_type','debit','amount_iqd',v_store.delivery_fee_iqd,'memo','Delivery fee settlement'),
  jsonb_build_object('wallet_account_id',v_captain_wallet,'entry_type','credit','amount_iqd',v_store.captain_delivery_earning_iqd,'memo','Captain delivery earning'),
  jsonb_build_object('wallet_account_id',v_platform_wallet,'entry_type','credit','amount_iqd',v_store.delivery_platform_commission_iqd,'memo','Platform delivery commission')
 ));
 return new;
end;
$$;
revoke all on function private.settle_delivered_store_wallets_v1() from public,anon,authenticated;
drop trigger if exists settle_delivered_store_wallets_v1 on public.delivery_assignments;
create trigger settle_delivered_store_wallets_v1
after update of status on public.delivery_assignments
for each row execute function private.settle_delivered_store_wallets_v1();

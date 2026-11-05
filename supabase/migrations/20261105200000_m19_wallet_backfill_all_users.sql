-- M19: backfill wallets for existing users and merchant stores.
-- Additive and idempotent; ledger history remains append-only.
insert into public.wallet_accounts(account_key,account_type,user_id,status)
select 'customer:'||u.id::text,'customer',u.id,'active'
from auth.users u
on conflict do nothing;

insert into public.wallet_accounts(account_key,account_type,user_id,status)
select 'captain:'||u.id::text,'captain',u.id,'active'
from auth.users u
where u.raw_app_meta_data->>'role'='captain'
on conflict do nothing;

insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
select 'merchant:'||s.id::text,'merchant',s.owner_id,s.id,'active'
from public.stores s
where s.is_platform_store=false and s.owner_id is not null
on conflict do nothing;

-- Keep new-user wallet creation for every registered account, regardless of role.
create or replace function private.create_customer_wallet()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.wallet_accounts(account_key,account_type,user_id,status)
 values('customer:'||new.id::text,'customer',new.id,'active')
 on conflict do nothing;
 if new.raw_app_meta_data->>'role'='captain' then
  insert into public.wallet_accounts(account_key,account_type,user_id,status)
  values('captain:'||new.id::text,'captain',new.id,'active')
  on conflict do nothing;
 end if;
 return new;
end;
$$;

-- M23 integration smoke test.
-- Run ONLY against an isolated database after applying M23.
-- All fixture writes are rolled back; never use this as a production migration.
begin;

do $m23_test$
declare
  v_cash_id uuid;
  v_platform_id uuid;
  v_transaction_id uuid;
  v_cash_before bigint;
  v_cash_after bigint;
  v_platform_before bigint;
  v_platform_after bigint;
  v_view_options text[];
  v_account_type_check text;
begin
  select id into v_cash_id
  from public.wallet_accounts
  where account_key='cash-clearing:delivery'
    and account_type='cash_clearing'
    and status='active';

  if v_cash_id is null then
    raise exception 'M23 test failed: active cash-clearing account is missing';
  end if;

  select id into v_platform_id
  from public.wallet_accounts
  where account_key='platform-main'
    and account_type='platform'
    and status='active';

  if v_platform_id is null then
    raise exception 'M23 test failed: active platform account is missing';
  end if;

  select reloptions into v_view_options
  from pg_class
  where oid='public.wallet_balances'::regclass;

  if not coalesce(v_view_options @> array['security_invoker=true'], false) then
    raise exception 'M23 test failed: wallet_balances must use security_invoker';
  end if;

  select pg_get_constraintdef(oid) into v_account_type_check
  from pg_constraint
  where conrelid='public.wallet_accounts'::regclass
    and conname='wallet_accounts_account_type_check';

  if v_account_type_check is null
     or position('escrow' in v_account_type_check)=0
     or position('cash_clearing' in v_account_type_check)=0 then
    raise exception 'M23 test failed: account type constraint must retain escrow and add cash_clearing';
  end if;

  if has_function_privilege('authenticated','public.post_wallet_transaction(uuid,jsonb)','execute')
     or not has_function_privilege('service_role','public.post_wallet_transaction(uuid,jsonb)','execute') then
    raise exception 'M23 test failed: ledger posting privileges are not backend-only';
  end if;

  if has_table_privilege('anon','public.wallet_balances','select')
     or not has_table_privilege('authenticated','public.wallet_balances','select') then
    raise exception 'M23 test failed: wallet_balances grants are incorrect';
  end if;

  select balance_iqd into v_cash_before
  from public.wallet_balances where wallet_account_id=v_cash_id;

  select balance_iqd into v_platform_before
  from public.wallet_balances where wallet_account_id=v_platform_id;

  insert into public.wallet_transactions(
    idempotency_key, transaction_type, status, amount_iqd, currency, metadata
  )
  values(
    'm23-smoke-'||gen_random_uuid()::text,
    'adjustment', 'pending', 1000, 'IQD',
    jsonb_build_object('test','m23-cash-clearing-smoke')
  )
  returning id into v_transaction_id;

  perform *
  from public.post_wallet_transaction(
    v_transaction_id,
    jsonb_build_array(
      jsonb_build_object(
        'wallet_account_id',v_cash_id,
        'entry_type','debit',
        'amount_iqd',1000,
        'memo','M23 isolated smoke test'
      ),
      jsonb_build_object(
        'wallet_account_id',v_platform_id,
        'entry_type','credit',
        'amount_iqd',1000,
        'memo','M23 isolated smoke test'
      )
    )
  );

  select balance_iqd into v_cash_after
  from public.wallet_balances where wallet_account_id=v_cash_id;

  select balance_iqd into v_platform_after
  from public.wallet_balances where wallet_account_id=v_platform_id;

  if v_cash_after-v_cash_before <> 1000 then
    raise exception 'M23 test failed: cash-clearing debit-normal balance did not increase by 1000 IQD';
  end if;

  if v_platform_after-v_platform_before <> 1000 then
    raise exception 'M23 test failed: platform credit-normal balance did not increase by 1000 IQD';
  end if;
end;
$m23_test$;

rollback;

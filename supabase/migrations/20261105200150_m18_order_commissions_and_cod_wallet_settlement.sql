-- M18: merchant commission snapshots and captain COD wallet settlement.
-- Additive schema changes; historical orders and ledger rows are not rewritten.

create or replace function private.apply_order_item_commission_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.commission_rules%rowtype;
  v_commission bigint := 0;
  v_per_kg bigint := null;
begin
  select cr.* into v_rule
  from public.commission_rules cr
  where cr.charge_type = 'merchant'
    and cr.is_active = true
    and cr.effective_from <= now()
    and (cr.effective_to is null or cr.effective_to > now())
    and (
      (cr.scope_type = 'store' and cr.store_id = new.store_id)
      or (cr.scope_type = 'platform' and cr.store_id is null)
    )
  order by case when cr.scope_type = 'store' then 0 else 1 end, cr.effective_from desc
  limit 1;

  if not found then
    raise exception 'merchant_commission_rule_missing' using errcode = 'P0002';
  end if;

  if v_rule.calculation_method = 'fixed_per_kg' then
    v_per_kg := v_rule.amount_iqd;
    if new.weight_kg is not null and new.weight_kg > 0 then
      v_commission := ceil(new.weight_kg * v_rule.amount_iqd)::bigint;
    end if;
  elsif v_rule.calculation_method = 'percentage' then
    v_commission := ceil((new.line_total_iqd::numeric * v_rule.basis_points::numeric) / 10000)::bigint;
  elsif v_rule.calculation_method = 'fixed_per_order' then
    v_commission := v_rule.amount_iqd;
  else
    raise exception 'unsupported_merchant_commission_method' using errcode = '22023';
  end if;

  v_commission := least(greatest(v_commission, 0), new.line_total_iqd);

  update public.order_items
  set merchant_commission_iqd = v_commission,
      commission_per_kg_iqd = v_per_kg
  where id = new.id;

  update public.order_stores os
  set merchant_commission_iqd = (
        select coalesce(sum(oi.merchant_commission_iqd), 0)::bigint
        from public.order_items oi
        where oi.order_store_id = new.order_store_id
      ),
      commission_snapshot = pg_catalog.jsonb_build_object(
        'status', 'applied',
        'rule_key', v_rule.rule_key,
        'scope_type', v_rule.scope_type,
        'calculation_method', v_rule.calculation_method,
        'calculation_basis', v_rule.calculation_basis,
        'amount_iqd', v_rule.amount_iqd,
        'basis_points', v_rule.basis_points,
        'calculated_at', now()
      ),
      updated_at = now()
  where os.id = new.order_store_id;

  return new;
end;
$$;

revoke all on function private.apply_order_item_commission_v1() from public, anon, authenticated;
drop trigger if exists order_items_apply_commission on public.order_items;
create trigger order_items_apply_commission
after insert on public.order_items
for each row execute function private.apply_order_item_commission_v1();

alter table public.delivery_assignments
  add column if not exists cod_collected_at timestamptz,
  add column if not exists cod_collected_iqd bigint,
  add column if not exists cod_receipt_reference text,
  add column if not exists cod_transaction_id uuid references public.wallet_transactions(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_assignments_cod_collection_consistency'
      and conrelid = 'public.delivery_assignments'::regclass
  ) then
    alter table public.delivery_assignments
      add constraint delivery_assignments_cod_collection_consistency
      check (
        (cod_collected_at is null and cod_collected_iqd is null and cod_transaction_id is null)
        or
        (cod_collected_at is not null and cod_collected_iqd is not null and cod_transaction_id is not null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_assignments_cod_receipt_length'
      and conrelid = 'public.delivery_assignments'::regclass
  ) then
    alter table public.delivery_assignments
      add constraint delivery_assignments_cod_receipt_length
      check (cod_receipt_reference is null or char_length(cod_receipt_reference) <= 160);
  end if;
end;
$$;

create unique index if not exists delivery_assignments_cod_transaction_uidx
  on public.delivery_assignments(cod_transaction_id)
  where cod_transaction_id is not null;

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
  v_receipt text := nullif(pg_catalog.btrim(coalesce(p_receipt_reference, '')), '');
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if public.current_app_role() is distinct from 'captain' then raise exception 'CAPTAIN_ROLE_REQUIRED' using errcode = '42501'; end if;
  if p_cash_received_iqd is null or p_cash_received_iqd <= 0 then raise exception 'INVALID_CASH_AMOUNT' using errcode = '22023'; end if;
  if v_receipt is not null and char_length(v_receipt) > 160 then raise exception 'RECEIPT_REFERENCE_TOO_LONG' using errcode = '22023'; end if;

  select da.* into v_assignment from public.delivery_assignments da
  where da.id = p_assignment_id for update;
  if not found then raise exception 'DELIVERY_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_assignment.captain_user_id is distinct from v_user_id then raise exception 'DELIVERY_NOT_ASSIGNED_TO_CAPTAIN' using errcode = '42501'; end if;
  if v_assignment.cod_transaction_id is not null then
    return pg_catalog.jsonb_build_object(
      'assignment_id',v_assignment.id,'transaction_id',v_assignment.cod_transaction_id,
      'cash_received_iqd',v_assignment.cod_collected_iqd,'idempotent_replay',true
    );
  end if;
  if v_assignment.status <> 'delivered' then raise exception 'DELIVERY_MUST_BE_DELIVERED_BEFORE_COD_COLLECTION' using errcode = 'P0001'; end if;

  select o.* into v_order from public.orders o where o.id = v_assignment.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.payment_method <> 'cash_on_delivery' then raise exception 'ORDER_IS_NOT_CASH_ON_DELIVERY' using errcode = '22023'; end if;
  if v_order.payment_status <> 'pending' then raise exception 'ORDER_PAYMENT_NOT_PENDING' using errcode = 'P0001'; end if;

  select os.* into v_order_store from public.order_stores os
  where os.id = v_assignment.order_store_id and os.order_id = v_order.id for update;
  if not found then raise exception 'ORDER_STORE_NOT_FOUND' using errcode = 'P0002'; end if;

  select allocation.delivery_share_iqd into v_delivery_share
  from (
    select os.id,
      case
        when row_number() over (order by os.created_at,os.id) = count(*) over () then
          v_order.delivery_fee_iqd - coalesce(sum(
            case when v_order.items_subtotal_iqd > 0
              then round(v_order.delivery_fee_iqd::numeric * os.items_subtotal_iqd / v_order.items_subtotal_iqd)::bigint
              else 0 end
          ) over (order by os.created_at,os.id rows between unbounded preceding and 1 preceding),0)
        when v_order.items_subtotal_iqd > 0
          then round(v_order.delivery_fee_iqd::numeric * os.items_subtotal_iqd / v_order.items_subtotal_iqd)::bigint
        else 0
      end as delivery_share_iqd
    from public.order_stores os where os.order_id = v_order.id
  ) allocation
  where allocation.id = v_order_store.id;

  v_delivery_share := coalesce(v_delivery_share,0);
  v_expected_cash := v_order_store.items_subtotal_iqd + v_delivery_share;
  if p_cash_received_iqd <> v_expected_cash then
    raise exception 'COD_AMOUNT_MISMATCH: expected %, received %',v_expected_cash,p_cash_received_iqd using errcode = '22023';
  end if;

  v_merchant_commission := least(greatest(v_order_store.merchant_commission_iqd,0),v_order_store.items_subtotal_iqd);
  v_merchant_net := v_order_store.items_subtotal_iqd - v_merchant_commission;
  select split.platform_fee_iqd,split.captain_fee_iqd
  into v_delivery_platform_fee,v_captain_fee
  from public.calculate_delivery_split(v_delivery_share) split;
  v_platform_credit := v_merchant_commission + v_delivery_platform_fee;

  insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
  values('merchant:'||v_order_store.store_id::text,'merchant',v_order_store.merchant_user_id,v_order_store.store_id,'active')
  on conflict(account_key) do nothing;
  insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
  values('captain:'||v_user_id::text,'captain',v_user_id,null,'active')
  on conflict(account_key) do nothing;

  select wa.id into v_platform_wallet_id from public.wallet_accounts wa
  where wa.account_key='platform-main' and wa.account_type='platform' and wa.status='active';
  select wa.id into v_merchant_wallet_id from public.wallet_accounts wa
  where wa.account_key='merchant:'||v_order_store.store_id::text and wa.account_type='merchant' and wa.status='active';
  select wa.id into v_captain_wallet_id from public.wallet_accounts wa
  where wa.account_key='captain:'||v_user_id::text and wa.account_type='captain' and wa.status='active';
  if v_platform_wallet_id is null then raise exception 'PLATFORM_WALLET_NOT_ACTIVE' using errcode = 'P0002'; end if;
  if v_merchant_wallet_id is null then raise exception 'MERCHANT_WALLET_NOT_ACTIVE' using errcode = 'P0002'; end if;
  if v_captain_wallet_id is null then raise exception 'CAPTAIN_WALLET_NOT_ACTIVE' using errcode = 'P0002'; end if;

  v_entries := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'wallet_account_id',v_platform_wallet_id,'entry_type','debit','amount_iqd',v_expected_cash,
    'memo','COD cash collected by captain for order '||v_order.order_number
  ));
  if v_merchant_net > 0 then
    v_entries := v_entries || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'wallet_account_id',v_merchant_wallet_id,'entry_type','credit','amount_iqd',v_merchant_net,
      'memo','Merchant net proceeds for order '||v_order.order_number
    ));
  end if;
  if v_captain_fee > 0 then
    v_entries := v_entries || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'wallet_account_id',v_captain_wallet_id,'entry_type','credit','amount_iqd',v_captain_fee,
      'memo','Captain delivery earning for order '||v_order.order_number
    ));
  end if;
  if v_platform_credit > 0 then
    v_entries := v_entries || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
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

  if not exists (
    select 1 from public.delivery_assignments da
    where da.order_id=v_order.id and da.status <> 'cancelled' and da.cod_collected_at is null
  ) then
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
comment on function public.captain_confirm_cod_collection_v1(uuid,bigint,text) is
  'Captain-only delivered-assignment COD confirmation with balanced idempotent wallet ledger settlement.';

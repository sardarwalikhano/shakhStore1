
-- Share & Earn is commission-on-completed-purchase, not a prepaid escrow campaign.
-- Keep the campaign's fixed reward amount, remove claim ceilings and all up-front reserve requirements.

alter table public.post_share_reward_campaigns
  alter column max_claims drop not null;

alter table public.post_share_reward_campaigns
  drop constraint if exists post_share_reward_budget_limit,
  drop constraint if exists post_share_reward_campaigns_max_claims_check,
  drop constraint if exists post_share_reward_funded_state,
  drop constraint if exists post_share_reward_funding_balances;

alter table public.post_share_reward_campaigns
  add constraint post_share_reward_campaigns_max_claims_check
  check (max_claims is null or max_claims > 0);

alter table public.post_share_reward_campaigns
  alter column reserved_amount_iqd set default 0;

alter table public.stores
  add column if not exists wallet_suspended_at timestamptz;

create table if not exists public.post_share_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.post_share_reward_campaigns(id) on delete restrict,
  post_id uuid not null references public.posts(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  sharer_user_id uuid not null references auth.users(id) on delete restrict,
  share_code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_share_links_code_format check (share_code ~ '^[a-f0-9]{40}$'),
  constraint post_share_links_campaign_user_unique unique (campaign_id, sharer_user_id)
);

create table if not exists public.post_share_order_attributions (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.post_share_links(id) on delete restrict,
  campaign_id uuid not null references public.post_share_reward_campaigns(id) on delete restrict,
  post_id uuid not null references public.posts(id) on delete restrict,
  order_store_id uuid not null references public.order_stores(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  sharer_user_id uuid not null references auth.users(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  reward_amount_iqd bigint not null check (reward_amount_iqd > 0),
  status text not null default 'pending'
    check (status in ('pending','pending_wallet','paid')),
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint post_share_order_attributions_one_reward_per_order unique (order_store_id),
  constraint post_share_order_attributions_paid_state check (
    (status = 'paid' and wallet_transaction_id is not null and paid_at is not null)
    or (status <> 'paid' and wallet_transaction_id is null and paid_at is null)
  )
);

create index if not exists post_share_links_sharer_created_idx
  on public.post_share_links (sharer_user_id, created_at desc);
create index if not exists post_share_order_attributions_sharer_created_idx
  on public.post_share_order_attributions (sharer_user_id, created_at desc);
create index if not exists post_share_order_attributions_store_status_idx
  on public.post_share_order_attributions (store_id, status, created_at);
create index if not exists post_share_order_attributions_campaign_idx
  on public.post_share_order_attributions (campaign_id, status);

alter table public.post_share_links enable row level security;
alter table public.post_share_order_attributions enable row level security;

drop policy if exists post_share_links_select_owner_or_admin on public.post_share_links;
create policy post_share_links_select_owner_or_admin
  on public.post_share_links for select to authenticated
  using (sharer_user_id = (select auth.uid()) or public.current_app_role() in ('admin','super_admin'));

drop policy if exists post_share_order_attributions_select_sharer_or_admin on public.post_share_order_attributions;
drop policy if exists post_share_order_attributions_select_participants on public.post_share_order_attributions;
create policy post_share_order_attributions_select_participants
  on public.post_share_order_attributions for select to authenticated
  using (
    sharer_user_id = (select auth.uid())
    or public.current_app_role() in ('admin','super_admin')
    or exists (
      select 1 from public.stores s
      where s.id = store_id and s.owner_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.post_share_links from anon, authenticated;
revoke insert, update, delete on public.post_share_order_attributions from anon, authenticated;
grant select on public.post_share_links to authenticated;
grant select on public.post_share_order_attributions to authenticated;

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.user_notifications enable row level security;
drop policy if exists user_notifications_select_owner_or_admin on public.user_notifications;
create policy user_notifications_select_owner_or_admin
  on public.user_notifications for select to authenticated
  using (user_id = (select auth.uid()) or public.current_app_role() in ('admin','super_admin'));
revoke insert, update, delete on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;

create or replace function private.enforce_post_orderable_product_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product_store_id uuid;
  v_product_status text;
  v_product_available boolean;
  v_store_status text;
  v_is_platform_store boolean;
begin
  if new.product_id is null then
    return new;
  end if;

  select p.store_id, p.status, p.is_available, s.status, s.is_platform_store
    into v_product_store_id, v_product_status, v_product_available, v_store_status, v_is_platform_store
  from public.products p
  join public.stores s on s.id = p.store_id
  where p.id = new.product_id;

  if not found or v_store_status is distinct from 'active' or v_is_platform_store is true then
    raise exception 'POST_PRODUCT_NOT_ORDERABLE' using errcode = '23514';
  end if;

  if new.store_id is not null and new.store_id is distinct from v_product_store_id then
    raise exception 'POST_PRODUCT_STORE_MISMATCH' using errcode = '23514';
  end if;

  -- A linked product may be a draft only while its post is also a draft.
  -- Publication still requires an approved, published and available product.
  if new.status = 'draft' and v_product_status = 'draft' and v_product_available is true then
    return new;
  end if;

  if v_product_status is distinct from 'published' or v_product_available is not true then
    raise exception 'POST_PRODUCT_NOT_ORDERABLE' using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function private.configure_post_share_reward_v1(
  p_post_id uuid,
  p_reward_amount_iqd bigint,
  p_max_claims integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := public.current_app_role();
  v_post public.posts%rowtype;
  v_store public.stores%rowtype;
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_campaign_found boolean := false;
  v_category text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role not in ('restaurant','supermarket','produce_vendor','meat_seafood_vendor') then
    raise exception 'MERCHANT_REQUIRED' using errcode = '42501';
  end if;
  if p_post_id is null then
    raise exception 'POST_REQUIRED' using errcode = '22023';
  end if;

  select * into v_post from public.posts p where p.id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_post.author_user_id <> v_actor or v_post.store_id is null then
    raise exception 'POST_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select * into v_store
  from public.stores s
  where s.id = v_post.store_id and s.owner_id = v_actor
    and s.is_platform_store = false and s.status = 'active'
  for update;
  if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode = '42501'; end if;

  v_category := case v_role
    when 'restaurant' then 'restaurant'
    when 'supermarket' then 'supermarket'
    when 'produce_vendor' then 'fruits_vegetables'
    when 'meat_seafood_vendor' then 'meat_seafood'
    else null
  end;
  if v_store.merchant_category is distinct from v_category then
    raise exception 'MERCHANT_ROLE_STORE_MISMATCH' using errcode = '42501';
  end if;
  if v_post.status <> 'draft' then
    raise exception 'SHARE_REWARD_MUST_BE_SET_BEFORE_PUBLISHING' using errcode = '55000';
  end if;

  select * into v_campaign
  from public.post_share_reward_campaigns c
  where c.post_id = p_post_id
  for update;
  v_campaign_found := found;

  if coalesce(p_reward_amount_iqd, 0) = 0 then
    if v_campaign_found and v_campaign.status <> 'configured' then
      raise exception 'ACTIVE_SHARE_REWARD_CANNOT_BE_REMOVED' using errcode = '55000';
    end if;
    delete from public.post_share_reward_campaigns c
    where c.post_id = p_post_id and c.status = 'configured';
    return jsonb_build_object('configured', false, 'reward_amount_iqd', 0, 'max_claims', null);
  end if;

  if p_reward_amount_iqd < 1 or p_reward_amount_iqd > 10000000 then
    raise exception 'INVALID_SHARE_REWARD_CONFIGURATION' using errcode = '22023';
  end if;

  if v_campaign_found then
    if v_campaign.status <> 'configured' then
      if v_campaign.reward_amount_iqd = p_reward_amount_iqd then
        return jsonb_build_object(
          'configured', true,
          'reward_amount_iqd', v_campaign.reward_amount_iqd,
          'max_claims', null,
          'status', v_campaign.status
        );
      end if;
      raise exception 'ACTIVE_SHARE_REWARD_CANNOT_BE_CHANGED' using errcode = '55000';
    end if;

    update public.post_share_reward_campaigns
    set reward_amount_iqd = p_reward_amount_iqd,
        max_claims = null,
        reserved_amount_iqd = 0,
        released_amount_iqd = 0,
        funded_at = null,
        paid_amount_iqd = 0,
        updated_at = now()
    where id = v_campaign.id;
  else
    insert into public.post_share_reward_campaigns (
      post_id, store_id, reward_amount_iqd, max_claims, reserved_amount_iqd, funded_at
    )
    values (p_post_id, v_post.store_id, p_reward_amount_iqd, null, 0, null);
  end if;

  return jsonb_build_object(
    'configured', true,
    'reward_amount_iqd', p_reward_amount_iqd,
    'max_claims', null,
    'upfront_reserve_iqd', 0
  );
end;
$function$;

create or replace function private.change_post_status_with_share_reward_v1(
  p_post_id uuid,
  p_new_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := public.current_app_role();
  v_post public.posts%rowtype;
  v_store public.stores%rowtype;
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_campaign_found boolean := false;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if v_role not in ('admin','super_admin','restaurant','supermarket','produce_vendor','meat_seafood_vendor') then
    raise exception 'POST_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  if p_new_status not in ('draft','published','archived') then
    raise exception 'INVALID_POST_STATUS' using errcode = '22023';
  end if;

  select * into v_post from public.posts p where p.id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_role in ('restaurant','supermarket','produce_vendor','meat_seafood_vendor') then
    if v_post.author_user_id <> v_actor or v_post.store_id is null then
      raise exception 'POST_OWNER_REQUIRED' using errcode = '42501';
    end if;
    select * into v_store from public.stores s
    where s.id = v_post.store_id and s.owner_id = v_actor
      and s.is_platform_store = false and s.status = 'active'
    for update;
    if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode = '42501'; end if;
    if (v_role = 'restaurant' and v_store.merchant_category <> 'restaurant')
      or (v_role = 'supermarket' and v_store.merchant_category <> 'supermarket')
      or (v_role = 'produce_vendor' and v_store.merchant_category <> 'fruits_vegetables')
      or (v_role = 'meat_seafood_vendor' and v_store.merchant_category <> 'meat_seafood') then
      raise exception 'MERCHANT_ROLE_STORE_MISMATCH' using errcode = '42501';
    end if;
  elsif v_role in ('admin','super_admin') and v_post.store_id is not null then
    select * into v_store from public.stores s
    where s.id = v_post.store_id and s.is_platform_store = false and s.status = 'active';
    if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode = '42501'; end if;
  end if;

  if not (
    (v_post.status = 'draft' and p_new_status = 'published')
    or (v_post.status = 'published' and p_new_status = 'archived')
    or (v_post.status = 'archived' and p_new_status = 'draft')
  ) then
    raise exception 'INVALID_POST_STATUS_TRANSITION' using errcode = '55000';
  end if;

  select * into v_campaign
  from public.post_share_reward_campaigns c
  where c.post_id = p_post_id
  for update;
  v_campaign_found := found;

  if p_new_status = 'published' and v_campaign_found then
    if v_campaign.status = 'closed' then
      raise exception 'SHARE_REWARD_CAMPAIGN_CLOSED_CREATE_NEW_POST' using errcode = '55000';
    end if;
    if v_campaign.status = 'configured' then
      update public.post_share_reward_campaigns
      set status = 'active',
          reserved_amount_iqd = 0,
          released_amount_iqd = 0,
          funded_at = null,
          updated_at = now()
      where id = v_campaign.id;
    end if;
  elsif p_new_status = 'archived' and v_campaign_found then
    update public.post_share_reward_campaigns
    set status = 'closed', updated_at = now()
    where id = v_campaign.id;
    update public.post_share_links
    set is_active = false, updated_at = now()
    where campaign_id = v_campaign.id;
  end if;

  update public.posts
  set status = p_new_status,
      published_at = case when p_new_status = 'published' then now() else null end
  where id = p_post_id;

  return jsonb_build_object(
    'post_id', p_post_id,
    'status', p_new_status,
    'share_reward_status', case
      when not v_campaign_found then null
      when p_new_status = 'published' then 'active'
      when p_new_status = 'archived' then 'closed'
      else v_campaign.status
    end,
    'upfront_reserve_iqd', 0
  );
end;
$function$;

create or replace function private.create_post_share_link_v1(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := public.current_app_role();
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_post public.posts%rowtype;
  v_store_owner uuid;
  v_share_code text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if v_role <> 'customer' then raise exception 'CUSTOMER_REQUIRED' using errcode = '42501'; end if;

  select * into v_post
  from public.posts p
  where p.id = p_post_id and p.status = 'published'
    and p.published_at is not null and p.published_at <= now();
  if not found then raise exception 'SHARE_REWARD_NOT_ACTIVE' using errcode = 'P0002'; end if;

  select * into v_campaign
  from public.post_share_reward_campaigns c
  where c.post_id = p_post_id and c.status = 'active';
  if not found then raise exception 'SHARE_REWARD_NOT_ACTIVE' using errcode = 'P0001'; end if;

  select s.owner_id into v_store_owner
  from public.stores s
  where s.id = v_campaign.store_id and s.status = 'active' and s.is_platform_store = false;
  if not found then raise exception 'SHARE_REWARD_NOT_ACTIVE' using errcode = 'P0001'; end if;

  if v_post.author_user_id = v_actor then
    raise exception 'POST_AUTHOR_CANNOT_SHARE' using errcode = '42501';
  end if;
  if v_store_owner = v_actor then
    raise exception 'STORE_OWNER_CANNOT_SHARE' using errcode = '42501';
  end if;

  insert into public.wallet_accounts (account_key, account_type, user_id, status)
  values ('customer:' || v_actor::text, 'customer', v_actor, 'active')
  on conflict (account_key) do nothing;

  insert into public.post_share_links (campaign_id, post_id, store_id, sharer_user_id, share_code)
  values (v_campaign.id, v_post.id, v_campaign.store_id, v_actor, encode(gen_random_bytes(20), 'hex'))
  on conflict (campaign_id, sharer_user_id)
  do update set is_active = true, updated_at = now()
  returning share_code into v_share_code;

  return jsonb_build_object('share_code', v_share_code, 'post_id', v_post.id);
end;
$function$;

create or replace function private.attach_post_share_referral_v1(
  p_order_id uuid,
  p_share_code text,
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_order_customer uuid;
  v_link public.post_share_links%rowtype;
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_order_store_id uuid;
  v_store_id uuid;
  v_existing_link uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if public.current_app_role() <> 'customer' then raise exception 'CUSTOMER_REQUIRED' using errcode = '42501'; end if;
  if p_share_code is null or p_share_code !~ '^[a-f0-9]{40}$' or p_product_id is null then return; end if;

  select o.customer_id into v_order_customer
  from public.orders o
  where o.id = p_order_id;
  if not found or v_order_customer <> v_actor then
    raise exception 'ORDER_CUSTOMER_REQUIRED' using errcode = '42501';
  end if;

  select * into v_link
  from public.post_share_links l
  where l.share_code = lower(p_share_code) and l.is_active = true;
  if not found then return; end if;
  if v_link.sharer_user_id = v_actor then return; end if;

  select * into v_campaign
  from public.post_share_reward_campaigns c
  where c.id = v_link.campaign_id and c.post_id = v_link.post_id
    and c.store_id = v_link.store_id and c.reward_amount_iqd > 0;
  if not found then return; end if;

  if not exists (
    select 1 from public.posts p
    where p.id = v_link.post_id and p.product_id = p_product_id
  ) then return; end if;

  select os.id, os.store_id into v_order_store_id, v_store_id
  from public.order_stores os
  join public.order_items oi on oi.order_store_id = os.id
  where os.order_id = p_order_id
    and os.customer_id = v_actor
    and os.store_id = v_link.store_id
    and oi.product_id = p_product_id
  order by os.created_at
  limit 1
  for update of os;

  if not found then return; end if;

  select a.share_link_id into v_existing_link
  from public.post_share_order_attributions a
  where a.order_store_id = v_order_store_id;
  if found then return; end if;

  insert into public.post_share_order_attributions (
    share_link_id, campaign_id, post_id, order_store_id, store_id,
    sharer_user_id, customer_user_id, reward_amount_iqd, status
  )
  values (
    v_link.id, v_campaign.id, v_link.post_id, v_order_store_id, v_store_id,
    v_link.sharer_user_id, v_actor, v_campaign.reward_amount_iqd, 'pending'
  )
  on conflict (order_store_id) do nothing;
end;
$function$;

create or replace function public.create_post_share_link_v1(p_post_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private.create_post_share_link_v1(p_post_id);
$function$;

revoke all on function private.create_post_share_link_v1(uuid) from public, anon, authenticated;
revoke all on function private.attach_post_share_referral_v1(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.create_post_share_link_v1(uuid) to authenticated;

create or replace function public.create_order_v1(
  p_address_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_customer_note text default null,
  p_payment_method text default 'cash_on_delivery'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_order_id uuid;
  v_item record;
begin
  v_result := private.create_order_v1(
    p_address_id,
    p_items,
    p_idempotency_key,
    p_customer_note,
    p_payment_method
  );

  v_order_id := nullif(v_result ->> 'order_id', '')::uuid;
  if v_order_id is not null then
    for v_item in
      select distinct x.product_id, x.referral_code
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
        product_id uuid,
        quantity numeric,
        referral_code text
      )
      where x.referral_code is not null and x.referral_code <> ''
      order by x.product_id, x.referral_code
    loop
      perform private.attach_post_share_referral_v1(
        v_order_id,
        v_item.referral_code,
        v_item.product_id
      );
    end loop;
  end if;

  return v_result;
end;
$function$;

create or replace function private.ensure_store_suspended_for_empty_wallet_v1(
  p_store_id uuid,
  p_source_transaction_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_wallet_id uuid;
  v_balance numeric;
  v_rows integer;
begin
  select s.owner_id into v_owner_id
  from public.stores s
  where s.id = p_store_id and s.is_platform_store = false;
  if not found or v_owner_id is null then return; end if;

  select wa.id into v_wallet_id
  from public.wallet_accounts wa
  where wa.account_type = 'merchant' and wa.store_id = p_store_id
    and wa.status = 'active';

  if v_wallet_id is null then
    v_balance := 0;
  else
    select coalesce(sum(case when le.entry_type = 'credit' then le.amount_iqd else -le.amount_iqd end), 0)
      into v_balance
    from public.wallet_ledger_entries le
    where le.wallet_account_id = v_wallet_id;
  end if;

  if v_balance > 0 then return; end if;

  update public.stores
  set status = 'suspended', wallet_suspended_at = coalesce(wallet_suspended_at, now()), updated_at = now()
  where id = p_store_id and status = 'active';
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    insert into public.user_notifications (
      user_id, notification_type, title, body, metadata, dedupe_key
    )
    values (
      v_owner_id,
      'store_wallet_empty',
      'دوکانەکەت ناچالاک کرا',
      'باڵانسی جزدانی پێشەکی بەتاڵ بوو؛ دوکانەکەت بە شێوەی خۆکار ناچالاک کرا. جزدان پڕ بکەرەوە و پەیوەندی بە بەڕێوەبەرەوە بکە بۆ چالاککردنەوە.',
      jsonb_build_object('store_id', p_store_id, 'wallet_balance_iqd', 0, 'source_transaction_id', p_source_transaction_id),
      'store-wallet-empty:' || p_store_id::text || ':' || coalesce(p_source_transaction_id::text, gen_random_uuid()::text)
    )
    on conflict (dedupe_key) do nothing;
  end if;
end;
$function$;

create or replace function private.settle_post_share_order_reward_v1(p_order_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attribution public.post_share_order_attributions%rowtype;
  v_order_store public.order_stores%rowtype;
  v_store_owner uuid;
  v_debit_wallet uuid;
  v_credit_wallet uuid;
  v_balance numeric;
  v_tx_id uuid;
begin
  select * into v_order_store
  from public.order_stores os
  where os.id = p_order_store_id
  for update;
  if not found or v_order_store.status <> 'delivered' then
    return jsonb_build_object('settled', false, 'reason', 'order_not_delivered');
  end if;

  select * into v_attribution
  from public.post_share_order_attributions a
  where a.order_store_id = p_order_store_id
  for update;
  if not found or v_attribution.status = 'paid' then
    return jsonb_build_object('settled', false, 'reason', 'no_pending_attribution');
  end if;

  select s.owner_id into v_store_owner
  from public.stores s
  where s.id = v_attribution.store_id and s.is_platform_store = false;
  if not found or v_store_owner is null then
    update public.post_share_order_attributions set status = 'pending_wallet'
    where id = v_attribution.id and status <> 'paid';
    return jsonb_build_object('settled', false, 'reason', 'merchant_store_missing');
  end if;

  select wa.id into v_debit_wallet
  from public.wallet_accounts wa
  where wa.account_type = 'merchant'
    and wa.store_id = v_attribution.store_id
    and wa.user_id = v_store_owner
    and wa.status = 'active'
  for update;
  if not found then
    update public.post_share_order_attributions set status = 'pending_wallet'
    where id = v_attribution.id and status <> 'paid';
    perform private.ensure_store_suspended_for_empty_wallet_v1(v_attribution.store_id, null);
    return jsonb_build_object('settled', false, 'reason', 'merchant_wallet_missing');
  end if;

  insert into public.wallet_accounts (account_key, account_type, user_id, status)
  values ('customer:' || v_attribution.sharer_user_id::text, 'customer', v_attribution.sharer_user_id, 'active')
  on conflict (account_key) do nothing;

  select wa.id into v_credit_wallet
  from public.wallet_accounts wa
  where wa.account_type = 'customer'
    and wa.user_id = v_attribution.sharer_user_id
    and wa.status = 'active'
  for update;
  if not found then
    update public.post_share_order_attributions set status = 'pending_wallet'
    where id = v_attribution.id and status <> 'paid';
    return jsonb_build_object('settled', false, 'reason', 'sharer_wallet_missing');
  end if;

  select coalesce(sum(case when le.entry_type = 'credit' then le.amount_iqd else -le.amount_iqd end), 0)
    into v_balance
  from public.wallet_ledger_entries le
  where le.wallet_account_id = v_debit_wallet;

  if v_balance < v_attribution.reward_amount_iqd then
    update public.post_share_order_attributions
    set status = 'pending_wallet'
    where id = v_attribution.id and status <> 'paid';
    if v_balance <= 0 then
      perform private.ensure_store_suspended_for_empty_wallet_v1(v_attribution.store_id, null);
    else
      insert into public.user_notifications (
        user_id, notification_type, title, body, metadata, dedupe_key
      )
      values (
        v_store_owner,
        'share_reward_wallet_shortfall',
        'جزدان بەشی خەڵاتی شێر ناکات',
        'داواکارییەک گەیەنراوەکە خەڵاتی شێری هەیە، بەڵام باڵانسی جزدان بەشی بڕەکە ناکات. دوای پڕکردنەوەی جزدان خەڵاتەکە خۆکارانە دەدرێت.',
        jsonb_build_object('store_id', v_attribution.store_id, 'attribution_id', v_attribution.id, 'required_iqd', v_attribution.reward_amount_iqd, 'available_iqd', v_balance),
        'share-reward-shortfall:' || v_attribution.id::text
      )
      on conflict (dedupe_key) do nothing;
    end if;
    return jsonb_build_object('settled', false, 'reason', 'insufficient_merchant_wallet', 'available_iqd', v_balance);
  end if;

  begin
    v_tx_id := private.post_share_reward_wallet_transfer_v1(
      'post-share-order:' || v_attribution.order_store_id::text,
      v_attribution.reward_amount_iqd,
      v_attribution.sharer_user_id,
      v_store_owner,
      jsonb_build_object(
        'purpose', 'post_share_reward_completed_purchase',
        'campaign_id', v_attribution.campaign_id,
        'post_id', v_attribution.post_id,
        'store_id', v_attribution.store_id,
        'order_store_id', v_attribution.order_store_id,
        'share_link_id', v_attribution.share_link_id
      ),
      v_debit_wallet,
      v_credit_wallet,
      'Share & Earn reward for completed purchase ' || v_attribution.order_store_id::text,
      'Share & Earn reward received for completed purchase ' || v_attribution.order_store_id::text
    );
  exception
    when sqlstate '23514' then
      update public.post_share_order_attributions
      set status = 'pending_wallet'
      where id = v_attribution.id and status <> 'paid';
      perform private.ensure_store_suspended_for_empty_wallet_v1(v_attribution.store_id, null);
      return jsonb_build_object('settled', false, 'reason', 'wallet_changed_during_settlement');
  end;

  update public.post_share_order_attributions
  set status = 'paid', wallet_transaction_id = v_tx_id, paid_at = now()
  where id = v_attribution.id and status <> 'paid';

  update public.post_share_reward_campaigns
  set paid_amount_iqd = paid_amount_iqd + v_attribution.reward_amount_iqd,
      updated_at = now()
  where id = v_attribution.campaign_id;

  select coalesce(sum(case when le.entry_type = 'credit' then le.amount_iqd else -le.amount_iqd end), 0)
    into v_balance
  from public.wallet_ledger_entries le
  where le.wallet_account_id = v_debit_wallet;

  if v_balance <= 0 then
    perform private.ensure_store_suspended_for_empty_wallet_v1(v_attribution.store_id, v_tx_id);
  end if;

  return jsonb_build_object('settled', true, 'wallet_transaction_id', v_tx_id, 'reward_amount_iqd', v_attribution.reward_amount_iqd);
end;
$function$;

create or replace function private.retry_pending_post_share_rewards_for_store_v1(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
begin
  for v_row in
    select a.order_store_id
    from public.post_share_order_attributions a
    join public.order_stores os on os.id = a.order_store_id
    where a.store_id = p_store_id
      and a.status = 'pending_wallet'
      and os.status = 'delivered'
    order by a.created_at
  loop
    perform private.settle_post_share_order_reward_v1(v_row.order_store_id);
  end loop;
end;
$function$;

create or replace function private.handle_merchant_wallet_ledger_entry_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store_id uuid;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  select wa.store_id into v_store_id
  from public.wallet_accounts wa
  where wa.id = new.wallet_account_id
    and wa.account_type = 'merchant'
    and wa.store_id is not null;

  if v_store_id is null then return new; end if;

  if new.entry_type = 'debit' then
    perform private.ensure_store_suspended_for_empty_wallet_v1(v_store_id, new.transaction_id);
  elsif new.entry_type = 'credit' then
    perform private.retry_pending_post_share_rewards_for_store_v1(v_store_id);
  end if;

  return new;
end;
$function$;

create or replace function private.settle_delivered_order_share_reward_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    perform private.settle_post_share_order_reward_v1(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists order_store_share_reward_on_delivery on public.order_stores;
create trigger order_store_share_reward_on_delivery
after update of status on public.order_stores
for each row execute function private.settle_delivered_order_share_reward_trigger_v1();

drop trigger if exists merchant_wallet_auto_suspend_and_retry_share_rewards on public.wallet_ledger_entries;
create trigger merchant_wallet_auto_suspend_and_retry_share_rewards
after insert on public.wallet_ledger_entries
for each row execute function private.handle_merchant_wallet_ledger_entry_v1();

-- Make the public campaign projection explicit and non-sensitive.
create or replace view public.post_share_rewards_public
with (security_invoker = true)
as
select
  c.post_id,
  c.reward_amount_iqd,
  null::integer as max_claims,
  null::integer as remaining_claims
from public.post_share_reward_campaigns c
join public.posts p on p.id = c.post_id
where c.status = 'active'
  and p.status = 'published'
  and p.published_at is not null
  and p.published_at <= now();

grant select on public.post_share_rewards_public to anon, authenticated;

-- Disable the legacy manual-proof claim endpoints. Existing historical rows remain untouched.
do $block$
begin
  if to_regprocedure('public.submit_post_share_reward_claim_v1(uuid,text)') is not null then
    execute 'revoke all on function public.submit_post_share_reward_claim_v1(uuid,text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.review_post_share_reward_claim_v1(uuid,text,text)') is not null then
    execute 'revoke all on function public.review_post_share_reward_claim_v1(uuid,text,text) from public, anon, authenticated';
  end if;
end;
$block$;

-- Apply the empty-wallet rule to merchant stores that are already active at rollout.
do $block$
declare
  v_store record;
begin
  for v_store in
    select s.id from public.stores s
    where s.is_platform_store = false and s.status = 'active'
    order by s.id
  loop
    perform private.ensure_store_suspended_for_empty_wallet_v1(v_store.id, null);
  end loop;
end;
$block$;

-- Public Postgres functions called through PostgREST.
revoke all on function public.create_order_v1(uuid,jsonb,text,text,text) from public, anon;
grant execute on function public.create_order_v1(uuid,jsonb,text,text,text) to authenticated;

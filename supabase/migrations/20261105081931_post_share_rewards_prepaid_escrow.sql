-- Share-and-Earn campaigns for merchant posts.
-- The initial implementation reserves reward budgets into the platform ledger;
-- the following escrow migration isolates these funds in a dedicated wallet.

create table public.post_share_reward_campaigns (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  reward_amount_iqd bigint not null check (reward_amount_iqd between 1 and 10000000),
  max_claims integer not null check (max_claims between 1 and 1000),
  reserved_amount_iqd bigint not null default 0 check (reserved_amount_iqd >= 0),
  paid_amount_iqd bigint not null default 0 check (paid_amount_iqd >= 0),
  released_amount_iqd bigint not null default 0 check (released_amount_iqd >= 0),
  status text not null default 'configured'
    check (status in ('configured','active','completed','closed')),
  created_at timestamptz not null default now(),
  funded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint post_share_reward_budget_limit
    check ((reward_amount_iqd::numeric * max_claims::numeric) <= 500000000),
  constraint post_share_reward_funding_balances
    check (paid_amount_iqd + released_amount_iqd <= reserved_amount_iqd),
  constraint post_share_reward_funded_state
    check (
      (status = 'configured' and reserved_amount_iqd = 0 and funded_at is null)
      or (status <> 'configured' and funded_at is not null)
    )
);

create index post_share_reward_campaigns_store_idx
  on public.post_share_reward_campaigns(store_id,created_at desc);
create index post_share_reward_campaigns_status_idx
  on public.post_share_reward_campaigns(status,created_at desc);

create table public.post_share_reward_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.post_share_reward_campaigns(id) on delete restrict,
  post_id uuid not null references public.posts(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  reward_amount_iqd bigint not null check (reward_amount_iqd > 0),
  proof_url text not null check (
    char_length(proof_url) between 12 and 2000
    and proof_url ~* '^https://[^[:space:]]+$'
  ),
  status text not null default 'pending'
    check (status in ('pending','paid','rejected')),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_share_reward_claim_review_state check (
    (status = 'pending' and reviewed_at is null and wallet_transaction_id is null)
    or (status = 'rejected' and reviewed_at is not null and wallet_transaction_id is null)
    or (status = 'paid' and reviewed_at is not null and wallet_transaction_id is not null)
  ),
  constraint post_share_reward_claim_unique_customer unique(post_id,customer_user_id)
);

create index post_share_reward_claims_campaign_idx
  on public.post_share_reward_claims(campaign_id,status,created_at);
create index post_share_reward_claims_customer_idx
  on public.post_share_reward_claims(customer_user_id,created_at desc);
create index post_share_reward_claims_status_idx
  on public.post_share_reward_claims(status,created_at desc);

alter table public.post_share_reward_campaigns enable row level security;
alter table public.post_share_reward_claims enable row level security;

create policy post_share_reward_campaigns_select_owner_admin_or_active
on public.post_share_reward_campaigns
for select to anon,authenticated
using (
  (
    status = 'active'
    and exists (
      select 1 from public.posts p
      where p.id = post_share_reward_campaigns.post_id
        and p.status = 'published'
        and p.published_at is not null
        and p.published_at <= now()
    )
  )
  or exists (
    select 1 from public.stores s
    where s.id = post_share_reward_campaigns.store_id
      and s.owner_id = (select auth.uid())
  )
  or public.current_app_role() = 'super_admin'
);

create policy post_share_reward_claims_select_customer_or_super_admin
on public.post_share_reward_claims
for select to authenticated
using (
  customer_user_id = (select auth.uid())
  or public.current_app_role() = 'super_admin'
);

revoke all privileges on public.post_share_reward_campaigns,public.post_share_reward_claims
  from anon,authenticated;
grant select on public.post_share_reward_campaigns to anon,authenticated;
grant select on public.post_share_reward_claims to authenticated;
grant all privileges on public.post_share_reward_campaigns,public.post_share_reward_claims
  to service_role;

create or replace view public.post_share_rewards_public
with (security_invoker = true)
as
select c.post_id,c.reward_amount_iqd,c.max_claims
from public.post_share_reward_campaigns c
join public.posts p on p.id = c.post_id
where c.status = 'active'
  and p.status = 'published'
  and p.published_at is not null
  and p.published_at <= now();

revoke all on public.post_share_rewards_public from public,anon,authenticated;
grant select on public.post_share_rewards_public to anon,authenticated;

create or replace function private.post_share_reward_wallet_transfer_v1(
  p_idempotency_key text,
  p_amount_iqd bigint,
  p_owner_user_id uuid,
  p_created_by_user_id uuid,
  p_metadata jsonb,
  p_debit_wallet_id uuid,
  p_credit_wallet_id uuid,
  p_debit_memo text,
  p_credit_memo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction_id uuid;
  v_status text;
begin
  if p_amount_iqd is null or p_amount_iqd <= 0
     or p_debit_wallet_id is null or p_credit_wallet_id is null
     or p_debit_wallet_id = p_credit_wallet_id then
    raise exception 'INVALID_SHARE_REWARD_TRANSFER' using errcode = '22023';
  end if;

  insert into public.wallet_transactions (
    idempotency_key,transaction_type,status,amount_iqd,owner_user_id,
    created_by_user_id,metadata
  )
  values (
    p_idempotency_key,'transfer','pending',p_amount_iqd,p_owner_user_id,
    p_created_by_user_id,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select wt.id,wt.status into v_transaction_id,v_status
    from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key
    for update;
    if v_status = 'posted' then return v_transaction_id; end if;
    if v_status is distinct from 'pending' then
      raise exception 'SHARE_REWARD_TRANSFER_NOT_POSTABLE' using errcode = '55000';
    end if;
  end if;

  perform public.post_wallet_transaction(
    v_transaction_id,
    jsonb_build_array(
      jsonb_build_object('wallet_account_id',p_debit_wallet_id,'entry_type','debit','amount_iqd',p_amount_iqd,'memo',p_debit_memo),
      jsonb_build_object('wallet_account_id',p_credit_wallet_id,'entry_type','credit','amount_iqd',p_amount_iqd,'memo',p_credit_memo)
    )
  );
  return v_transaction_id;
end;
$function$;

revoke all on function private.post_share_reward_wallet_transfer_v1(
  text,bigint,uuid,uuid,jsonb,uuid,uuid,text,text
) from public,anon,authenticated;

create or replace function private.configure_post_share_reward_v1(
  p_post_id uuid,
  p_reward_amount_iqd bigint,
  p_max_claims integer
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := public.current_app_role();
  v_post public.posts%rowtype;
  v_store public.stores%rowtype;
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_category text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if v_role not in ('restaurant','supermarket','produce_vendor','meat_seafood_vendor') then raise exception 'MERCHANT_REQUIRED' using errcode = '42501'; end if;
  if p_post_id is null then raise exception 'POST_REQUIRED' using errcode = '22023'; end if;

  select * into v_post from public.posts p where p.id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_post.author_user_id <> v_actor or v_post.store_id is null then raise exception 'POST_OWNER_REQUIRED' using errcode = '42501'; end if;

  select * into v_store from public.stores s
  where s.id = v_post.store_id and s.owner_id = v_actor
    and s.is_platform_store = false and s.status = 'active'
  for update;
  if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode = '42501'; end if;

  v_category := case v_role
    when 'restaurant' then 'restaurant'
    when 'supermarket' then 'supermarket'
    when 'produce_vendor' then 'fruits_vegetables'
    when 'meat_seafood_vendor' then 'meat_seafood'
    else null end;
  if v_store.merchant_category is distinct from v_category then raise exception 'MERCHANT_ROLE_STORE_MISMATCH' using errcode = '42501'; end if;
  if v_post.status <> 'draft' then raise exception 'SHARE_REWARD_MUST_BE_SET_BEFORE_PUBLISHING' using errcode = '55000'; end if;

  select * into v_campaign from public.post_share_reward_campaigns c where c.post_id = p_post_id for update;

  if coalesce(p_reward_amount_iqd,0) = 0 then
    if coalesce(p_max_claims,0) not in (0,10) then raise exception 'INVALID_SHARE_REWARD_LIMIT' using errcode = '22023'; end if;
    if found and v_campaign.status <> 'configured' then raise exception 'FUNDED_SHARE_REWARD_CANNOT_BE_REMOVED' using errcode = '55000'; end if;
    delete from public.post_share_reward_campaigns c where c.post_id = p_post_id and c.status = 'configured';
    return jsonb_build_object('configured',false,'reward_amount_iqd',0,'max_claims',0);
  end if;

  if p_reward_amount_iqd < 100 or p_reward_amount_iqd > 10000000
     or p_max_claims is null or p_max_claims < 1 or p_max_claims > 1000
     or (p_reward_amount_iqd::numeric * p_max_claims::numeric) > 500000000 then
    raise exception 'INVALID_SHARE_REWARD_CONFIGURATION' using errcode = '22023';
  end if;

  if found then
    if v_campaign.status <> 'configured' then
      if v_campaign.reward_amount_iqd = p_reward_amount_iqd and v_campaign.max_claims = p_max_claims then
        return jsonb_build_object('configured',true,'reward_amount_iqd',v_campaign.reward_amount_iqd,'max_claims',v_campaign.max_claims,'status',v_campaign.status);
      end if;
      raise exception 'FUNDED_SHARE_REWARD_CANNOT_BE_CHANGED' using errcode = '55000';
    end if;
    update public.post_share_reward_campaigns
    set reward_amount_iqd = p_reward_amount_iqd,max_claims = p_max_claims,updated_at = now()
    where id = v_campaign.id;
  else
    insert into public.post_share_reward_campaigns(post_id,store_id,reward_amount_iqd,max_claims)
    values(p_post_id,v_post.store_id,p_reward_amount_iqd,p_max_claims);
  end if;
  return jsonb_build_object('configured',true,'reward_amount_iqd',p_reward_amount_iqd,'max_claims',p_max_claims,'total_budget_iqd',p_reward_amount_iqd::numeric * p_max_claims::numeric);
end;
$function$;

create or replace function private.change_post_status_with_share_reward_v1(
  p_post_id uuid,
  p_new_status text
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := public.current_app_role();
  v_post public.posts%rowtype;
  v_store public.stores%rowtype;
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_merchant_wallet uuid;
  v_platform_wallet uuid;
  v_budget bigint;
  v_release bigint;
  v_pending_claims integer;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if v_role not in ('admin','super_admin','restaurant','supermarket','produce_vendor','meat_seafood_vendor') then raise exception 'POST_MANAGER_REQUIRED' using errcode = '42501'; end if;
  if p_new_status not in ('draft','published','archived') then raise exception 'INVALID_POST_STATUS' using errcode = '22023'; end if;

  select * into v_post from public.posts p where p.id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_role in ('restaurant','supermarket','produce_vendor','meat_seafood_vendor') then
    if v_post.author_user_id <> v_actor or v_post.store_id is null then raise exception 'POST_OWNER_REQUIRED' using errcode = '42501'; end if;
    select * into v_store from public.stores s where s.id = v_post.store_id and s.owner_id = v_actor and s.is_platform_store = false and s.status = 'active' for update;
    if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode = '42501'; end if;
    if (v_role = 'restaurant' and v_store.merchant_category <> 'restaurant')
      or (v_role = 'supermarket' and v_store.merchant_category <> 'supermarket')
      or (v_role = 'produce_vendor' and v_store.merchant_category <> 'fruits_vegetables')
      or (v_role = 'meat_seafood_vendor' and v_store.merchant_category <> 'meat_seafood') then
      raise exception 'MERCHANT_ROLE_STORE_MISMATCH' using errcode = '42501';
    end if;
  elsif v_role in ('admin','super_admin') and v_post.store_id is not null then
    select * into v_store from public.stores s where s.id = v_post.store_id and s.is_platform_store = false and s.status = 'active';
    if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode = '42501'; end if;
  end if;

  if not ((v_post.status = 'draft' and p_new_status = 'published')
    or (v_post.status = 'published' and p_new_status = 'archived')
    or (v_post.status = 'archived' and p_new_status = 'draft')) then
    raise exception 'INVALID_POST_STATUS_TRANSITION' using errcode = '55000';
  end if;

  select * into v_campaign from public.post_share_reward_campaigns c where c.post_id = p_post_id for update;

  if p_new_status = 'published' and found then
    if v_campaign.status = 'closed' then raise exception 'SHARE_REWARD_CAMPAIGN_CLOSED_CREATE_NEW_POST' using errcode = '55000'; end if;
    if v_campaign.status = 'configured' then
      select wa.id into v_merchant_wallet from public.wallet_accounts wa
      where wa.account_type = 'merchant' and wa.store_id = v_campaign.store_id
        and wa.user_id = v_store.owner_id and wa.status = 'active' for update;
      if not found then raise exception 'MERCHANT_PREPAID_WALLET_NOT_FOUND' using errcode = 'P0002'; end if;

      select wa.id into v_platform_wallet from public.wallet_accounts wa
      where wa.account_key = 'platform-main' and wa.account_type = 'platform' and wa.status = 'active' for update;
      if not found then raise exception 'PLATFORM_ESCROW_WALLET_NOT_FOUND' using errcode = 'P0002'; end if;

      v_budget := (v_campaign.reward_amount_iqd::numeric * v_campaign.max_claims::numeric)::bigint;
      perform private.post_share_reward_wallet_transfer_v1(
        'post-share-reserve:' || v_campaign.id::text,v_budget,v_store.owner_id,v_actor,
        jsonb_build_object('purpose','post_share_reward_reserve','campaign_id',v_campaign.id,'post_id',p_post_id,'store_id',v_campaign.store_id),
        v_merchant_wallet,v_platform_wallet,
        'Reserve share reward for post ' || p_post_id::text,'Escrow share reward for post ' || p_post_id::text
      );
      update public.post_share_reward_campaigns set status='active',reserved_amount_iqd=v_budget,funded_at=now(),updated_at=now() where id=v_campaign.id;
    end if;
  elsif p_new_status = 'archived' and found then
    if v_campaign.status = 'active' then
      select count(*)::integer into v_pending_claims from public.post_share_reward_claims c where c.campaign_id=v_campaign.id and c.status='pending';
      if v_pending_claims>0 then raise exception 'SHARE_REWARD_PENDING_CLAIMS_REVIEW_FIRST' using errcode='55000'; end if;
      v_release := v_campaign.reserved_amount_iqd-v_campaign.paid_amount_iqd-v_campaign.released_amount_iqd;
      if v_release>0 then
        select wa.id into v_platform_wallet from public.wallet_accounts wa
        where wa.account_key='platform-main' and wa.account_type='platform' and wa.status='active' for update;
        select wa.id into v_merchant_wallet from public.wallet_accounts wa
        where wa.account_type='merchant' and wa.store_id=v_campaign.store_id and wa.status='active' for update;
        perform private.post_share_reward_wallet_transfer_v1(
          'post-share-release:' || v_campaign.id::text,v_release,v_store.owner_id,v_actor,
          jsonb_build_object('purpose','post_share_reward_release','campaign_id',v_campaign.id,'post_id',p_post_id),
          v_platform_wallet,v_merchant_wallet,
          'Release unused share reward reserve for post ' || p_post_id::text,'Return unused share reward reserve for post ' || p_post_id::text
        );
      end if;
      update public.post_share_reward_campaigns set status='closed',released_amount_iqd=released_amount_iqd+v_release,updated_at=now() where id=v_campaign.id;
    elsif v_campaign.status='configured' then
      update public.post_share_reward_campaigns set status='closed',updated_at=now() where id=v_campaign.id;
    end if;
  end if;

  update public.posts set status=p_new_status,published_at=case when p_new_status='published' then now() else null end where id=p_post_id;
  return jsonb_build_object('post_id',p_post_id,'status',p_new_status,'share_reward_status',case when found then v_campaign.status else null end);
end;
$function$;

create or replace function private.submit_post_share_reward_claim_v1(
  p_post_id uuid,
  p_proof_url text
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_post public.posts%rowtype;
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_claim public.post_share_reward_claims%rowtype;
  v_used_slots integer;
begin
  if v_actor is null or public.current_app_role() <> 'customer' then raise exception 'CUSTOMER_REQUIRED' using errcode = '42501'; end if;
  if p_post_id is null or p_proof_url is null or char_length(p_proof_url) not between 12 and 2000 or p_proof_url !~* '^https://[^[:space:]]+$' then
    raise exception 'INVALID_SHARE_PROOF_URL' using errcode = '22023';
  end if;
  select * into v_post from public.posts p where p.id=p_post_id and p.status='published' and p.published_at is not null and p.published_at<=now();
  if not found then raise exception 'PUBLISHED_POST_NOT_FOUND' using errcode='P0002'; end if;
  if v_post.author_user_id=v_actor then raise exception 'POST_AUTHOR_CANNOT_CLAIM_REWARD' using errcode='42501'; end if;

  select * into v_campaign from public.post_share_reward_campaigns c where c.post_id=p_post_id and c.status='active' for update;
  if not found then raise exception 'SHARE_REWARD_NOT_ACTIVE' using errcode='55000'; end if;
  if exists(select 1 from public.stores s where s.id=v_campaign.store_id and s.owner_id=v_actor) then
    raise exception 'STORE_OWNER_CANNOT_CLAIM_REWARD' using errcode='42501';
  end if;

  select * into v_claim from public.post_share_reward_claims c where c.post_id=p_post_id and c.customer_user_id=v_actor for update;
  if found and v_claim.status in ('pending','paid') then raise exception 'SHARE_REWARD_ALREADY_REQUESTED' using errcode='23505'; end if;

  select count(*)::integer into v_used_slots from public.post_share_reward_claims c
  where c.campaign_id=v_campaign.id and c.status in ('pending','paid');
  if v_used_slots>=v_campaign.max_claims then raise exception 'SHARE_REWARD_CLAIMS_LIMIT_REACHED' using errcode='55000'; end if;

  if v_claim.id is not null then
    update public.post_share_reward_claims
    set proof_url=p_proof_url,reward_amount_iqd=v_campaign.reward_amount_iqd,status='pending',
      reviewed_by_user_id=null,reviewed_at=null,review_note=null,wallet_transaction_id=null,updated_at=now()
    where id=v_claim.id returning * into v_claim;
  else
    insert into public.post_share_reward_claims(campaign_id,post_id,customer_user_id,reward_amount_iqd,proof_url)
    values(v_campaign.id,p_post_id,v_actor,v_campaign.reward_amount_iqd,p_proof_url)
    returning * into v_claim;
  end if;
  return jsonb_build_object('claim_id',v_claim.id,'status',v_claim.status);
end;
$function$;

create or replace function private.review_post_share_reward_claim_v1(
  p_claim_id uuid,
  p_decision text,
  p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_claim public.post_share_reward_claims%rowtype;
  v_campaign public.post_share_reward_campaigns%rowtype;
  v_platform_wallet uuid;
  v_customer_wallet uuid;
  v_transaction_id uuid;
  v_next_paid bigint;
begin
  if v_actor is null or public.current_app_role()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_claim_id is null or p_decision not in ('approve','reject') then raise exception 'INVALID_SHARE_REWARD_REVIEW' using errcode='22023'; end if;
  if char_length(coalesce(p_review_note,''))>1000 then raise exception 'REVIEW_NOTE_TOO_LONG' using errcode='22023'; end if;

  select * into v_claim from public.post_share_reward_claims c where c.id=p_claim_id for update;
  if not found then raise exception 'SHARE_REWARD_CLAIM_NOT_FOUND' using errcode='P0002'; end if;
  if v_claim.status<>'pending' then raise exception 'SHARE_REWARD_CLAIM_ALREADY_REVIEWED' using errcode='55000'; end if;
  select * into v_campaign from public.post_share_reward_campaigns c where c.id=v_claim.campaign_id for update;
  if not found or v_campaign.status not in ('active','completed') then raise exception 'SHARE_REWARD_CAMPAIGN_NOT_PAYABLE' using errcode='55000'; end if;

  if p_decision='reject' then
    if char_length(btrim(coalesce(p_review_note,'')))<2 then raise exception 'REJECTION_REASON_REQUIRED' using errcode='22023'; end if;
    update public.post_share_reward_claims set status='rejected',reviewed_by_user_id=v_actor,reviewed_at=now(),review_note=btrim(p_review_note),updated_at=now() where id=p_claim_id;
    return jsonb_build_object('claim_id',p_claim_id,'status','rejected');
  end if;

  if v_claim.reward_amount_iqd>v_campaign.reserved_amount_iqd-v_campaign.paid_amount_iqd-v_campaign.released_amount_iqd then
    raise exception 'SHARE_REWARD_ESCROW_INSUFFICIENT' using errcode='23514';
  end if;
  select wa.id into v_platform_wallet from public.wallet_accounts wa where wa.account_key='platform-main' and wa.account_type='platform' and wa.status='active' for update;
  if not found then raise exception 'PLATFORM_ESCROW_WALLET_NOT_FOUND' using errcode='P0002'; end if;

  insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
  values('customer:'||v_claim.customer_user_id::text,'customer',v_claim.customer_user_id,null,'active')
  on conflict(account_key) do nothing;

  select wa.id into v_customer_wallet from public.wallet_accounts wa where wa.account_type='customer' and wa.user_id=v_claim.customer_user_id and wa.status='active' for update;
  if not found then raise exception 'CUSTOMER_WALLET_NOT_FOUND' using errcode='P0002'; end if;

  v_transaction_id:=private.post_share_reward_wallet_transfer_v1(
    'post-share-payout:'||v_claim.id::text,v_claim.reward_amount_iqd,v_claim.customer_user_id,v_actor,
    jsonb_build_object('purpose','post_share_reward_payout','campaign_id',v_campaign.id,'post_id',v_claim.post_id,'claim_id',v_claim.id,'merchant_store_id',v_campaign.store_id),
    v_platform_wallet,v_customer_wallet,
    'Share reward payout for post '||v_claim.post_id::text,'Share reward received for post '||v_claim.post_id::text
  );
  v_next_paid:=v_campaign.paid_amount_iqd+v_claim.reward_amount_iqd;
  update public.post_share_reward_claims set status='paid',reviewed_by_user_id=v_actor,reviewed_at=now(),review_note=nullif(btrim(coalesce(p_review_note,'')),''),wallet_transaction_id=v_transaction_id,updated_at=now() where id=p_claim_id;
  update public.post_share_reward_campaigns set paid_amount_iqd=v_next_paid,status=case when v_next_paid>=reserved_amount_iqd then 'completed' else status end,updated_at=now() where id=v_campaign.id;
  return jsonb_build_object('claim_id',p_claim_id,'status','paid','reward_amount_iqd',v_claim.reward_amount_iqd,'wallet_transaction_id',v_transaction_id);
end;
$function$;

create or replace function public.configure_post_share_reward_v1(p_post_id uuid,p_reward_amount_iqd bigint,p_max_claims integer)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.configure_post_share_reward_v1(p_post_id,p_reward_amount_iqd,p_max_claims); $function$;

create or replace function public.change_post_status_with_share_reward_v1(p_post_id uuid,p_new_status text)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.change_post_status_with_share_reward_v1(p_post_id,p_new_status); $function$;

create or replace function public.submit_post_share_reward_claim_v1(p_post_id uuid,p_proof_url text)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.submit_post_share_reward_claim_v1(p_post_id,p_proof_url); $function$;

create or replace function public.review_post_share_reward_claim_v1(p_claim_id uuid,p_decision text,p_review_note text default null)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.review_post_share_reward_claim_v1(p_claim_id,p_decision,p_review_note); $function$;

revoke all on function private.configure_post_share_reward_v1(uuid,bigint,integer) from public,anon,authenticated;
revoke all on function private.change_post_status_with_share_reward_v1(uuid,text) from public,anon,authenticated;
revoke all on function private.submit_post_share_reward_claim_v1(uuid,text) from public,anon,authenticated;
revoke all on function private.review_post_share_reward_claim_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.configure_post_share_reward_v1(uuid,bigint,integer) from public,anon;
revoke all on function public.change_post_status_with_share_reward_v1(uuid,text) from public,anon;
revoke all on function public.submit_post_share_reward_claim_v1(uuid,text) from public,anon;
revoke all on function public.review_post_share_reward_claim_v1(uuid,text,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function public.configure_post_share_reward_v1(uuid,bigint,integer) to authenticated;
grant execute on function public.change_post_status_with_share_reward_v1(uuid,text) to authenticated;
grant execute on function public.submit_post_share_reward_claim_v1(uuid,text) to authenticated;
grant execute on function public.review_post_share_reward_claim_v1(uuid,text,text) to authenticated;

notify pgrst,'reload schema';

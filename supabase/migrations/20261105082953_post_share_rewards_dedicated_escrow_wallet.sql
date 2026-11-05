-- Isolate reward reserves from the general platform wallet.
-- This escrow account is separately balance-checked by post_wallet_transaction.

alter table public.wallet_accounts
  drop constraint if exists wallet_accounts_account_type_check,
  drop constraint if exists wallet_accounts_owner_scope;

alter table public.wallet_accounts
  add constraint wallet_accounts_account_type_check
  check (account_type in ('customer','merchant','captain','platform','escrow'));

alter table public.wallet_accounts
  add constraint wallet_accounts_owner_scope check (
    (
      account_type in ('customer','captain')
      and user_id is not null and store_id is null
    )
    or (
      account_type = 'merchant'
      and user_id is not null and store_id is not null
    )
    or (
      account_type in ('platform','escrow')
      and user_id is null and store_id is null
    )
  );

create unique index if not exists wallet_single_post_share_escrow_account_idx
  on public.wallet_accounts(account_type)
  where account_type = 'escrow';

insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
values ('post-share-reward-escrow','escrow',null,null,'active')
on conflict (account_key) do nothing;

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
  v_escrow_wallet uuid;
  v_budget bigint;
  v_release bigint;
  v_pending_claims integer;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if v_role not in ('admin','super_admin','restaurant','supermarket','produce_vendor','meat_seafood_vendor') then raise exception 'POST_MANAGER_REQUIRED' using errcode = '42501'; end if;
  if p_new_status not in ('draft','published','archived') then raise exception 'INVALID_POST_STATUS' using errcode = '22023'; end if;

  select * into v_post from public.posts p where p.id=p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode='P0002'; end if;

  if v_role in ('restaurant','supermarket','produce_vendor','meat_seafood_vendor') then
    if v_post.author_user_id<>v_actor or v_post.store_id is null then raise exception 'POST_OWNER_REQUIRED' using errcode='42501'; end if;
    select * into v_store from public.stores s
    where s.id=v_post.store_id and s.owner_id=v_actor and s.is_platform_store=false and s.status='active'
    for update;
    if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode='42501'; end if;
    if (v_role='restaurant' and v_store.merchant_category<>'restaurant')
      or (v_role='supermarket' and v_store.merchant_category<>'supermarket')
      or (v_role='produce_vendor' and v_store.merchant_category<>'fruits_vegetables')
      or (v_role='meat_seafood_vendor' and v_store.merchant_category<>'meat_seafood') then
      raise exception 'MERCHANT_ROLE_STORE_MISMATCH' using errcode='42501';
    end if;
  elsif v_role in ('admin','super_admin') and v_post.store_id is not null then
    select * into v_store from public.stores s where s.id=v_post.store_id and s.is_platform_store=false and s.status='active';
    if not found then raise exception 'ACTIVE_MERCHANT_STORE_REQUIRED' using errcode='42501'; end if;
  end if;

  if not ((v_post.status='draft' and p_new_status='published')
    or (v_post.status='published' and p_new_status='archived')
    or (v_post.status='archived' and p_new_status='draft')) then
    raise exception 'INVALID_POST_STATUS_TRANSITION' using errcode='55000';
  end if;

  select * into v_campaign from public.post_share_reward_campaigns c where c.post_id=p_post_id for update;

  if p_new_status='published' and found then
    if v_campaign.status='closed' then raise exception 'SHARE_REWARD_CAMPAIGN_CLOSED_CREATE_NEW_POST' using errcode='55000'; end if;
    if v_campaign.status='configured' then
      select wa.id into v_merchant_wallet from public.wallet_accounts wa
      where wa.account_type='merchant' and wa.store_id=v_campaign.store_id and wa.user_id=v_store.owner_id and wa.status='active'
      for update;
      if not found then raise exception 'MERCHANT_PREPAID_WALLET_NOT_FOUND' using errcode='P0002'; end if;

      select wa.id into v_escrow_wallet from public.wallet_accounts wa
      where wa.account_key='post-share-reward-escrow' and wa.account_type='escrow' and wa.status='active'
      for update;
      if not found then raise exception 'POST_SHARE_ESCROW_WALLET_NOT_FOUND' using errcode='P0002'; end if;

      v_budget := (v_campaign.reward_amount_iqd::numeric * v_campaign.max_claims::numeric)::bigint;
      perform private.post_share_reward_wallet_transfer_v1(
        'post-share-reserve:'||v_campaign.id::text,v_budget,v_store.owner_id,v_actor,
        jsonb_build_object('purpose','post_share_reward_reserve','campaign_id',v_campaign.id,'post_id',p_post_id,'store_id',v_campaign.store_id),
        v_merchant_wallet,v_escrow_wallet,
        'Reserve share reward for post '||p_post_id::text,'Escrow share reward for post '||p_post_id::text
      );
      update public.post_share_reward_campaigns set status='active',reserved_amount_iqd=v_budget,funded_at=now(),updated_at=now() where id=v_campaign.id;
    end if;
  elsif p_new_status='archived' and found then
    if v_campaign.status='active' then
      select count(*)::integer into v_pending_claims from public.post_share_reward_claims c where c.campaign_id=v_campaign.id and c.status='pending';
      if v_pending_claims>0 then raise exception 'SHARE_REWARD_PENDING_CLAIMS_REVIEW_FIRST' using errcode='55000'; end if;
      v_release := v_campaign.reserved_amount_iqd-v_campaign.paid_amount_iqd-v_campaign.released_amount_iqd;
      if v_release>0 then
        select wa.id into v_escrow_wallet from public.wallet_accounts wa
        where wa.account_key='post-share-reward-escrow' and wa.account_type='escrow' and wa.status='active'
        for update;
        select wa.id into v_merchant_wallet from public.wallet_accounts wa
        where wa.account_type='merchant' and wa.store_id=v_campaign.store_id and wa.status='active'
        for update;
        perform private.post_share_reward_wallet_transfer_v1(
          'post-share-release:'||v_campaign.id::text,v_release,v_store.owner_id,v_actor,
          jsonb_build_object('purpose','post_share_reward_release','campaign_id',v_campaign.id,'post_id',p_post_id),
          v_escrow_wallet,v_merchant_wallet,
          'Release unused share reward reserve for post '||p_post_id::text,'Return unused share reward reserve for post '||p_post_id::text
        );
      end if;
      update public.post_share_reward_campaigns
      set status='closed',released_amount_iqd=released_amount_iqd+v_release,updated_at=now()
      where id=v_campaign.id;
    elsif v_campaign.status='configured' then
      update public.post_share_reward_campaigns set status='closed',updated_at=now() where id=v_campaign.id;
    end if;
  end if;

  update public.posts
  set status=p_new_status,published_at=case when p_new_status='published' then now() else null end
  where id=p_post_id;

  return jsonb_build_object('post_id',p_post_id,'status',p_new_status,'share_reward_status',case when found then v_campaign.status else null end);
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
  v_escrow_wallet uuid;
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
  select wa.id into v_escrow_wallet from public.wallet_accounts wa
  where wa.account_key='post-share-reward-escrow' and wa.account_type='escrow' and wa.status='active'
  for update;
  if not found then raise exception 'POST_SHARE_ESCROW_WALLET_NOT_FOUND' using errcode='P0002'; end if;

  insert into public.wallet_accounts(account_key,account_type,user_id,store_id,status)
  values('customer:'||v_claim.customer_user_id::text,'customer',v_claim.customer_user_id,null,'active')
  on conflict(account_key) do nothing;

  select wa.id into v_customer_wallet from public.wallet_accounts wa
  where wa.account_type='customer' and wa.user_id=v_claim.customer_user_id and wa.status='active'
  for update;
  if not found then raise exception 'CUSTOMER_WALLET_NOT_FOUND' using errcode='P0002'; end if;

  v_transaction_id:=private.post_share_reward_wallet_transfer_v1(
    'post-share-payout:'||v_claim.id::text,v_claim.reward_amount_iqd,v_claim.customer_user_id,v_actor,
    jsonb_build_object('purpose','post_share_reward_payout','campaign_id',v_campaign.id,'post_id',v_claim.post_id,'claim_id',v_claim.id,'merchant_store_id',v_campaign.store_id),
    v_escrow_wallet,v_customer_wallet,
    'Share reward payout for post '||v_claim.post_id::text,'Share reward received for post '||v_claim.post_id::text
  );
  v_next_paid:=v_campaign.paid_amount_iqd+v_claim.reward_amount_iqd;
  update public.post_share_reward_claims
  set status='paid',reviewed_by_user_id=v_actor,reviewed_at=now(),review_note=nullif(btrim(coalesce(p_review_note,'')),''),
      wallet_transaction_id=v_transaction_id,updated_at=now()
  where id=p_claim_id;
  update public.post_share_reward_campaigns
  set paid_amount_iqd=v_next_paid,status=case when v_next_paid>=reserved_amount_iqd then 'completed' else status end,updated_at=now()
  where id=v_campaign.id;

  return jsonb_build_object('claim_id',p_claim_id,'status','paid','reward_amount_iqd',v_claim.reward_amount_iqd,'wallet_transaction_id',v_transaction_id);
end;
$function$;

revoke all on function private.change_post_status_with_share_reward_v1(uuid,text) from public,anon,authenticated;
revoke all on function private.review_post_share_reward_claim_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function private.change_post_status_with_share_reward_v1(uuid,text) to authenticated;
grant execute on function private.review_post_share_reward_claim_v1(uuid,text,text) to authenticated;

notify pgrst,'reload schema';

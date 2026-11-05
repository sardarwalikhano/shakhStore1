-- Keep immutable post labels in reward claim history for later audit.
alter table public.post_share_reward_claims
  add column post_title_snapshot text,
  add column post_slug_snapshot text;

update public.post_share_reward_claims c
set post_title_snapshot = p.title,
    post_slug_snapshot = p.slug
from public.posts p
where p.id = c.post_id
  and (c.post_title_snapshot is null or c.post_slug_snapshot is null);

alter table public.post_share_reward_claims
  alter column post_title_snapshot set not null,
  alter column post_slug_snapshot set not null;

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
  if v_actor is null or public.current_app_role() <> 'customer' then
    raise exception 'CUSTOMER_REQUIRED' using errcode = '42501';
  end if;
  if p_post_id is null or p_proof_url is null
     or char_length(p_proof_url) not between 12 and 2000
     or p_proof_url !~* '^https://[^[:space:]]+$' then
    raise exception 'INVALID_SHARE_PROOF_URL' using errcode = '22023';
  end if;

  select * into v_post from public.posts p
  where p.id = p_post_id and p.status = 'published'
    and p.published_at is not null and p.published_at <= now();
  if not found then raise exception 'PUBLISHED_POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_post.author_user_id = v_actor then raise exception 'POST_AUTHOR_CANNOT_CLAIM_REWARD' using errcode = '42501'; end if;

  select * into v_campaign
  from public.post_share_reward_campaigns c
  where c.post_id = p_post_id and c.status = 'active'
  for update;
  if not found then raise exception 'SHARE_REWARD_NOT_ACTIVE' using errcode = '55000'; end if;

  if exists (select 1 from public.stores s where s.id = v_campaign.store_id and s.owner_id = v_actor) then
    raise exception 'STORE_OWNER_CANNOT_CLAIM_REWARD' using errcode = '42501';
  end if;

  select * into v_claim
  from public.post_share_reward_claims c
  where c.post_id = p_post_id and c.customer_user_id = v_actor
  for update;

  if found and v_claim.status in ('pending','paid') then
    raise exception 'SHARE_REWARD_ALREADY_REQUESTED' using errcode = '23505';
  end if;

  select count(*)::integer into v_used_slots
  from public.post_share_reward_claims c
  where c.campaign_id = v_campaign.id and c.status in ('pending','paid');
  if v_used_slots >= v_campaign.max_claims then
    raise exception 'SHARE_REWARD_CLAIMS_LIMIT_REACHED' using errcode = '55000';
  end if;

  if v_claim.id is not null then
    update public.post_share_reward_claims
    set proof_url = p_proof_url,
        reward_amount_iqd = v_campaign.reward_amount_iqd,
        post_title_snapshot = v_post.title,
        post_slug_snapshot = v_post.slug,
        status = 'pending',
        reviewed_by_user_id = null,
        reviewed_at = null,
        review_note = null,
        wallet_transaction_id = null,
        updated_at = now()
    where id = v_claim.id
    returning * into v_claim;
  else
    insert into public.post_share_reward_claims (
      campaign_id,post_id,customer_user_id,reward_amount_iqd,proof_url,
      post_title_snapshot,post_slug_snapshot
    )
    values (
      v_campaign.id,p_post_id,v_actor,v_campaign.reward_amount_iqd,p_proof_url,
      v_post.title,v_post.slug
    )
    returning * into v_claim;
  end if;

  return jsonb_build_object('claim_id',v_claim.id,'status',v_claim.status);
end;
$function$;

revoke all on function private.submit_post_share_reward_claim_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function private.submit_post_share_reward_claim_v1(uuid,text)
  to authenticated;

notify pgrst, 'reload schema';

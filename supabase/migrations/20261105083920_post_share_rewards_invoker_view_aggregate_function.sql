-- Use a SECURITY INVOKER public view while returning only an aggregate claim count.
-- This avoids exposing customer IDs, proof URLs, claim statuses or wallet references.

create or replace function private.post_share_reward_remaining_claims_v1(
  p_campaign_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select greatest(
      c.max_claims - (
        select count(*)::integer
        from public.post_share_reward_claims cl
        where cl.campaign_id = c.id
          and cl.status in ('pending','paid')
      ),
      0
    )::integer
    from public.post_share_reward_campaigns c
    join public.posts p on p.id = c.post_id
    where c.id = p_campaign_id
      and c.status = 'active'
      and p.status = 'published'
      and p.published_at is not null
      and p.published_at <= now()
  ), 0);
$function$;

revoke all on function private.post_share_reward_remaining_claims_v1(uuid)
  from public,anon,authenticated;
grant usage on schema private to anon,authenticated;
grant execute on function private.post_share_reward_remaining_claims_v1(uuid)
  to anon,authenticated;

create or replace view public.post_share_rewards_public
with (security_invoker = true)
as
select
  c.post_id,
  c.reward_amount_iqd,
  c.max_claims,
  private.post_share_reward_remaining_claims_v1(c.id) as remaining_claims
from public.post_share_reward_campaigns c
join public.posts p on p.id = c.post_id
where c.status = 'active'
  and p.status = 'published'
  and p.published_at is not null
  and p.published_at <= now();

revoke all on public.post_share_rewards_public from public,anon,authenticated;
grant select on public.post_share_rewards_public to anon,authenticated;

comment on view public.post_share_rewards_public is
  'SECURITY INVOKER public reward terms; remaining slot count is returned by a narrow SECURITY DEFINER aggregate that exposes no claim details.';

notify pgrst, 'reload schema';

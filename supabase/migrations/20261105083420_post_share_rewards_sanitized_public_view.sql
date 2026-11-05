-- Public reward terms are a deliberately sanitized, owner-executed view.
-- It exposes only active published post rewards and a slot count; customer IDs,
-- proof links, claim statuses, and wallet transaction IDs remain private.
create or replace view public.post_share_rewards_public
with (security_invoker = false, security_barrier = true)
as
select
  c.post_id,
  c.reward_amount_iqd,
  c.max_claims,
  greatest(
    c.max_claims - (
      select count(*)::integer
      from public.post_share_reward_claims cl
      where cl.campaign_id = c.id
        and cl.status in ('pending','paid')
    ),
    0
  )::integer as remaining_claims
from public.post_share_reward_campaigns c
join public.posts p on p.id = c.post_id
where c.status = 'active'
  and p.status = 'published'
  and p.published_at is not null
  and p.published_at <= now();

revoke all on public.post_share_rewards_public from public,anon,authenticated;
grant select on public.post_share_rewards_public to anon,authenticated;

comment on view public.post_share_rewards_public is
  'Sanitized public reward terms and remaining slot count for active published posts; does not expose claim identities or proof URLs.';

notify pgrst, 'reload schema';

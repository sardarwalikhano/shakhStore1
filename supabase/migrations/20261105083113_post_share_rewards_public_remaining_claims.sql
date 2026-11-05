-- Expose the live number of reward slots remaining to customers.
create or replace view public.post_share_rewards_public
with (security_invoker = true)
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

notify pgrst, 'reload schema';

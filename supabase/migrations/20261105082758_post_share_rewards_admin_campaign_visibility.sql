-- Let platform admins read campaign terms in the post moderation dashboard.
drop policy if exists post_share_reward_campaigns_select_authenticated
on public.post_share_reward_campaigns;

create policy post_share_reward_campaigns_select_authenticated
on public.post_share_reward_campaigns
for select to authenticated
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
  or public.current_app_role() in ('admin','super_admin')
);

notify pgrst, 'reload schema';

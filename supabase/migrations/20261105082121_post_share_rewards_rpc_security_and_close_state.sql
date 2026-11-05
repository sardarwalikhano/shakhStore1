-- Correct the campaign close-state constraint and grant only guarded RPC entry points.
alter table public.post_share_reward_campaigns
  drop constraint if exists post_share_reward_funded_state;

alter table public.post_share_reward_campaigns
  add constraint post_share_reward_funded_state
  check (
    (status = 'configured' and reserved_amount_iqd = 0 and funded_at is null)
    or status = 'closed'
    or (status in ('active','completed') and funded_at is not null)
  );

drop policy if exists post_share_reward_campaigns_select_owner_admin_or_active
  on public.post_share_reward_campaigns;

create policy post_share_reward_campaigns_select_public_active
on public.post_share_reward_campaigns
for select to anon
using (
  status = 'active'
  and exists (
    select 1 from public.posts p
    where p.id = post_share_reward_campaigns.post_id
      and p.status = 'published'
      and p.published_at is not null
      and p.published_at <= now()
  )
);

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
  or public.current_app_role() = 'super_admin'
);

grant execute on function private.configure_post_share_reward_v1(uuid,bigint,integer)
  to authenticated;
grant execute on function private.change_post_status_with_share_reward_v1(uuid,text)
  to authenticated;
grant execute on function private.submit_post_share_reward_claim_v1(uuid,text)
  to authenticated;
grant execute on function private.review_post_share_reward_claim_v1(uuid,text,text)
  to authenticated;

notify pgrst, 'reload schema';

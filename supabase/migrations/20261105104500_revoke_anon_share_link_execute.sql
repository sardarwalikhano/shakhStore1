-- The share-link endpoint is intended for signed-in customers only.
-- Its private SECURITY DEFINER implementation performs role, ownership and campaign checks.
revoke all on function public.create_post_share_link_v1(uuid) from public, anon;
grant execute on function public.create_post_share_link_v1(uuid) to authenticated;

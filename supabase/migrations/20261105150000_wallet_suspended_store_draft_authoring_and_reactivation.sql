-- Allow merchants whose stores were suspended solely by the prepaid-wallet guard
-- to prepare draft content and upload draft images. Publishing and sales stay blocked.
-- A positive wallet credit automatically reactivates only wallet-suspended stores.

drop policy if exists posts_merchant_insert_own on public.posts;
create policy posts_merchant_insert_own
on public.posts
for insert to authenticated
with check (
  public.current_app_role() in ('restaurant','supermarket','produce_vendor','meat_seafood_vendor')
  and author_user_id = (select auth.uid())
  and store_id is not null
  and status = 'draft'
  and published_at is null
  and exists (
    select 1 from public.stores s
    where s.id = posts.store_id
      and s.owner_id = (select auth.uid())
      and s.is_platform_store = false
      and s.merchant_category = case public.current_app_role()
        when 'restaurant' then 'restaurant'
        when 'supermarket' then 'supermarket'
        when 'produce_vendor' then 'fruits_vegetables'
        when 'meat_seafood_vendor' then 'meat_seafood'
        else null
      end
      and (
        s.status = 'active'
        or (s.status = 'suspended' and s.wallet_suspended_at is not null)
      )
  )
);

drop policy if exists products_insert_store_scope on public.products;
create policy products_insert_store_scope
on public.products
for insert to authenticated
with check (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id
      and (
        (s.is_platform_store is true and public.current_app_role() = 'super_admin')
        or (
          s.is_platform_store is false
          and (
            s.status = 'active'
            or (s.status = 'suspended' and s.wallet_suspended_at is not null)
          )
          and (
            (
              s.owner_id = (select auth.uid())
              and (
                (s.merchant_category = 'restaurant' and public.current_app_role() = 'restaurant')
                or (s.merchant_category = 'supermarket' and public.current_app_role() = 'supermarket')
                or (s.merchant_category = 'fruits_vegetables' and public.current_app_role() = 'produce_vendor')
                or (s.merchant_category = 'meat_seafood' and public.current_app_role() = 'meat_seafood_vendor')
              )
            )
            or public.current_app_role() in ('admin','super_admin')
          )
        )
      )
  )
);

drop policy if exists product_images_insert_store_owner on storage.objects;
create policy product_images_insert_store_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.stores s
    where s.id::text = (storage.foldername(name))[1]
      and (
        s.status = 'active'
        or (
          s.is_platform_store is false and s.owner_id = (select auth.uid())
          and s.status = 'suspended' and s.wallet_suspended_at is not null
        )
      )
      and (
        (s.is_platform_store is true and public.current_app_role() = 'super_admin')
        or (s.is_platform_store is false and public.current_app_role() in ('admin','super_admin'))
        or (
          s.is_platform_store is false and s.owner_id = (select auth.uid())
          and (
            (s.merchant_category = 'restaurant' and public.current_app_role() = 'restaurant')
            or (s.merchant_category = 'supermarket' and public.current_app_role() = 'supermarket')
            or (s.merchant_category = 'fruits_vegetables' and public.current_app_role() = 'produce_vendor')
            or (s.merchant_category = 'meat_seafood' and public.current_app_role() = 'meat_seafood_vendor')
          )
        )
      )
  )
);

drop policy if exists product_images_delete_store_owner on storage.objects;
create policy product_images_delete_store_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.stores s
    where s.id::text = (storage.foldername(name))[1]
      and (
        s.status = 'active'
        or (
          s.is_platform_store is false and s.owner_id = (select auth.uid())
          and s.status = 'suspended' and s.wallet_suspended_at is not null
        )
      )
      and (
        (s.is_platform_store is true and public.current_app_role() = 'super_admin')
        or (s.is_platform_store is false and public.current_app_role() in ('admin','super_admin'))
        or (
          s.is_platform_store is false and s.owner_id = (select auth.uid())
          and (
            (s.merchant_category = 'restaurant' and public.current_app_role() = 'restaurant')
            or (s.merchant_category = 'supermarket' and public.current_app_role() = 'supermarket')
            or (s.merchant_category = 'fruits_vegetables' and public.current_app_role() = 'produce_vendor')
            or (s.merchant_category = 'meat_seafood' and public.current_app_role() = 'meat_seafood_vendor')
          )
        )
      )
  )
);

drop policy if exists post_covers_insert_manager on storage.objects;
create policy post_covers_insert_manager
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'post-covers'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    public.current_app_role() in ('admin','super_admin')
    or exists (
      select 1 from public.stores s
      where s.owner_id = (select auth.uid())
        and s.is_platform_store is false
        and s.merchant_category in ('restaurant','supermarket','fruits_vegetables','meat_seafood')
        and (
          s.status = 'active'
          or (s.status = 'suspended' and s.wallet_suspended_at is not null)
        )
    )
  )
);

drop policy if exists post_covers_delete_manager on storage.objects;
create policy post_covers_delete_manager
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'post-covers'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    public.current_app_role() in ('admin','super_admin')
    or exists (
      select 1 from public.stores s
      where s.owner_id = (select auth.uid())
        and s.is_platform_store is false
        and s.merchant_category in ('restaurant','supermarket','fruits_vegetables','meat_seafood')
        and (
          s.status = 'active'
          or (s.status = 'suspended' and s.wallet_suspended_at is not null)
        )
    )
  )
);

create or replace function private.enforce_post_orderable_product_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_product_store_id uuid;
  v_product_status text;
  v_product_available boolean;
  v_store_status text;
  v_wallet_suspended_at timestamptz;
  v_is_platform_store boolean;
begin
  if new.product_id is null then return new; end if;

  select p.store_id, p.status, p.is_available, s.status, s.wallet_suspended_at, s.is_platform_store
    into v_product_store_id, v_product_status, v_product_available, v_store_status, v_wallet_suspended_at, v_is_platform_store
  from public.products p
  join public.stores s on s.id = p.store_id
  where p.id = new.product_id;

  if not found or v_is_platform_store is true then
    raise exception 'POST_PRODUCT_NOT_ORDERABLE' using errcode = '23514';
  end if;
  if new.store_id is not null and new.store_id is distinct from v_product_store_id then
    raise exception 'POST_PRODUCT_STORE_MISMATCH' using errcode = '23514';
  end if;

  if new.status = 'draft'
     and v_product_status = 'draft'
     and v_product_available is true
     and (
       v_store_status = 'active'
       or (v_store_status = 'suspended' and v_wallet_suspended_at is not null)
     ) then
    return new;
  end if;

  if v_store_status is distinct from 'active'
     or v_product_status is distinct from 'published'
     or v_product_available is not true then
    raise exception 'POST_PRODUCT_NOT_ORDERABLE' using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_post_orderable_product_v1() from public, anon, authenticated;

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
  v_campaign_found boolean := false;
  v_category text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if v_role not in ('restaurant','supermarket','produce_vendor','meat_seafood_vendor') then
    raise exception 'MERCHANT_REQUIRED' using errcode = '42501';
  end if;
  if p_post_id is null then raise exception 'POST_REQUIRED' using errcode = '22023'; end if;

  select * into v_post from public.posts p where p.id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_post.author_user_id <> v_actor or v_post.store_id is null then
    raise exception 'POST_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select * into v_store
  from public.stores s
  where s.id = v_post.store_id
    and s.owner_id = v_actor
    and s.is_platform_store = false
    and (
      s.status = 'active'
      or (s.status = 'suspended' and s.wallet_suspended_at is not null)
    )
  for update;
  if not found then raise exception 'MERCHANT_STORE_REQUIRED' using errcode = '42501'; end if;

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

  select * into v_campaign from public.post_share_reward_campaigns c
  where c.post_id = p_post_id for update;
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
        return jsonb_build_object('configured', true, 'reward_amount_iqd', v_campaign.reward_amount_iqd,
          'max_claims', null, 'status', v_campaign.status);
      end if;
      raise exception 'ACTIVE_SHARE_REWARD_CANNOT_BE_CHANGED' using errcode = '55000';
    end if;
    update public.post_share_reward_campaigns
    set reward_amount_iqd = p_reward_amount_iqd, max_claims = null,
        reserved_amount_iqd = 0, released_amount_iqd = 0, funded_at = null,
        paid_amount_iqd = 0, updated_at = now()
    where id = v_campaign.id;
  else
    insert into public.post_share_reward_campaigns (
      post_id, store_id, reward_amount_iqd, max_claims, reserved_amount_iqd, funded_at
    ) values (p_post_id, v_post.store_id, p_reward_amount_iqd, null, 0, null);
  end if;

  return jsonb_build_object('configured', true, 'reward_amount_iqd', p_reward_amount_iqd,
    'max_claims', null, 'upfront_reserve_iqd', 0);
end;
$function$;

create or replace function private.handle_merchant_wallet_ledger_entry_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_store_id uuid;
  v_owner_id uuid;
  v_balance numeric;
  v_store_status text;
  v_wallet_suspended_at timestamptz;
  v_rows integer;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  select wa.store_id into v_store_id
  from public.wallet_accounts wa
  where wa.id = new.wallet_account_id
    and wa.account_type = 'merchant' and wa.store_id is not null;
  if v_store_id is null then return new; end if;

  if new.entry_type = 'debit' then
    perform private.ensure_store_suspended_for_empty_wallet_v1(v_store_id, new.transaction_id);
    return new;
  elsif new.entry_type <> 'credit' then
    return new;
  end if;

  perform private.retry_pending_post_share_rewards_for_store_v1(v_store_id);

  select s.owner_id, s.status, s.wallet_suspended_at
    into v_owner_id, v_store_status, v_wallet_suspended_at
  from public.stores s
  where s.id = v_store_id and s.is_platform_store = false
  for update;
  if not found or v_wallet_suspended_at is null or v_store_status <> 'suspended' then
    return new;
  end if;

  select coalesce(sum(case when le.entry_type = 'credit' then le.amount_iqd else -le.amount_iqd end), 0)
    into v_balance
  from public.wallet_ledger_entries le
  join public.wallet_accounts wa on wa.id = le.wallet_account_id
  where wa.account_type = 'merchant' and wa.store_id = v_store_id;

  if v_balance <= 0 then return new; end if;

  update public.stores
  set status = 'active', wallet_suspended_at = null, updated_at = now()
  where id = v_store_id and status = 'suspended' and wallet_suspended_at is not null;
  get diagnostics v_rows = row_count;

  if v_rows > 0 and v_owner_id is not null then
    insert into public.user_notifications (
      user_id, notification_type, title, body, metadata, dedupe_key
    ) values (
      v_owner_id, 'store_wallet_restored',
      'دوکانەکەت دووبارە چالاک بووەوە',
      'باڵانسی جزدانی پێشەکی زیاد کرا و باڵانسی ماوە ئەرێنییە؛ دوکانەکەت بە شێوەی خۆکار چالاک کرایەوە.',
      jsonb_build_object('store_id', v_store_id, 'wallet_balance_iqd', v_balance, 'source_transaction_id', new.transaction_id),
      'store-wallet-restored:' || v_store_id::text || ':' || new.transaction_id::text
    ) on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

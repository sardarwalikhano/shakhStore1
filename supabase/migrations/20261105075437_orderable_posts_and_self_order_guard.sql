-- Link a published Shakh Store post to a purchasable product.
alter table public.posts
  add column if not exists product_id uuid
  references public.products(id) on delete set null;

create index if not exists posts_product_id_idx
  on public.posts(product_id)
  where product_id is not null;

-- Super Admin may manage product inserts for active merchant stores;
-- merchants remain restricted to their own role-matched store.
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
          s.is_platform_store is false and s.status = 'active'
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

-- Super Admin / admin image uploads stay isolated to their own user folder
-- and only to an active, real merchant store (or Super Admin platform store).
drop policy if exists product_images_insert_store_owner on storage.objects;
create policy product_images_insert_store_owner
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(storage.objects.name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.stores s
    where s.id::text = (storage.foldername(storage.objects.name))[1]
      and s.status = 'active'
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
on storage.objects
for delete to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(storage.objects.name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.stores s
    where s.id::text = (storage.foldername(storage.objects.name))[1]
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

create or replace function private.enforce_post_orderable_product_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_product_store_id uuid;
  v_product_status text;
  v_product_available boolean;
  v_store_status text;
  v_is_platform_store boolean;
begin
  if new.product_id is null then return new; end if;

  select p.store_id, p.status, p.is_available, s.status, s.is_platform_store
  into v_product_store_id, v_product_status, v_product_available, v_store_status, v_is_platform_store
  from public.products p join public.stores s on s.id = p.store_id
  where p.id = new.product_id;

  if not found or v_product_status is distinct from 'published'
     or v_product_available is not true or v_store_status is distinct from 'active'
     or v_is_platform_store is true then
    raise exception 'POST_PRODUCT_NOT_ORDERABLE' using errcode = '23514';
  end if;
  if new.store_id is not null and new.store_id is distinct from v_product_store_id then
    raise exception 'POST_PRODUCT_STORE_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists posts_enforce_orderable_product on public.posts;
create trigger posts_enforce_orderable_product
before insert or update of product_id, store_id on public.posts
for each row execute function private.enforce_post_orderable_product_v1();

revoke all on function private.enforce_post_orderable_product_v1()
from public, anon, authenticated;

create or replace function private.reject_self_order_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.customer_id = new.merchant_user_id
     or (
       new.product_id is not null
       and exists (
         select 1 from public.posts p
         where p.product_id = new.product_id
           and p.author_user_id = new.customer_id
       )
     ) then
    raise exception 'CANNOT_ORDER_OWN_POST' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists order_items_reject_self_order on public.order_items;
create trigger order_items_reject_self_order
before insert on public.order_items
for each row execute function private.reject_self_order_v1();

revoke all on function private.reject_self_order_v1()
from public, anon, authenticated;

comment on column public.posts.product_id is
  'Optional published merchant product linked to this post for direct add-to-cart ordering.';

notify pgrst, 'reload schema';

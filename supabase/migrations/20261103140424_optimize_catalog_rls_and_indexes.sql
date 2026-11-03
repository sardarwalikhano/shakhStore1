-- Improve RLS query planning and index foreign-key lookups.
create index if not exists catalog_categories_parent_id_idx
  on public.catalog_categories (parent_id);

create index if not exists stores_owner_id_idx
  on public.stores (owner_id);

drop policy if exists catalog_categories_admin_manage on public.catalog_categories;
drop policy if exists catalog_categories_public_read on public.catalog_categories;

create policy catalog_categories_select_scope
on public.catalog_categories for select to anon, authenticated
using (
  is_active = true
  or public.current_app_role() in ('admin', 'super_admin')
);

create policy catalog_categories_admin_insert
on public.catalog_categories for insert to authenticated
with check (public.current_app_role() in ('admin', 'super_admin'));

create policy catalog_categories_admin_update
on public.catalog_categories for update to authenticated
using (public.current_app_role() in ('admin', 'super_admin'))
with check (public.current_app_role() in ('admin', 'super_admin'));

create policy catalog_categories_admin_delete
on public.catalog_categories for delete to authenticated
using (public.current_app_role() in ('admin', 'super_admin'));

drop policy if exists products_public_read_published on public.products;
drop policy if exists products_owner_and_admin_read on public.products;

create policy products_select_scope
on public.products for select to anon, authenticated
using (
  (
    status = 'published'
    and is_available = true
    and exists (
      select 1 from public.stores s
      where s.id = products.store_id and s.status = 'active'
    )
  )
  or
  exists (
    select 1 from public.stores s
    where s.id = products.store_id
      and (
        s.owner_id = (select auth.uid())
        or public.current_app_role() in ('admin', 'super_admin')
      )
  )
);

-- Initial SHAKH Auth, profiles, catalog and RLS foundation.
-- Generated from the first schema rollout on 2026-11-01.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  preferred_locale text not null default 'ckb'
    check (preferred_locale in ('ckb', 'ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 160),
  constraint profiles_phone_length check (phone is null or char_length(phone) <= 32)
);

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.catalog_categories(id) on delete restrict,
  slug text not null unique,
  name_ckb text not null,
  name_ar text,
  name_en text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint catalog_categories_slug_format check (slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$')
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete restrict,
  name text not null,
  slug text not null unique,
  merchant_category text,
  description text,
  logo_url text,
  phone text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'rejected')),
  is_platform_store boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_name_length check (char_length(name) between 2 and 160),
  constraint stores_slug_format check (slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint stores_category check (
    (is_platform_store = true and owner_id is null and merchant_category is null)
    or
    (is_platform_store = false and owner_id is not null and merchant_category in
      ('restaurant', 'supermarket', 'fruits_vegetables', 'meat_seafood'))
  )
);

create unique index stores_one_platform_store_idx
  on public.stores (is_platform_store)
  where is_platform_store = true;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  category_id uuid references public.catalog_categories(id) on delete restrict,
  name text not null,
  description text,
  sku text,
  price_iqd bigint not null check (price_iqd >= 0),
  compare_at_price_iqd bigint check (compare_at_price_iqd is null or compare_at_price_iqd >= price_iqd),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  unit text not null default 'piece',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_length check (char_length(name) between 2 and 180),
  constraint products_unit_length check (char_length(unit) between 1 and 32),
  unique (store_id, sku)
);

create index products_store_status_idx on public.products (store_id, status);
create index products_category_status_idx on public.products (category_id, status);
create index stores_status_category_idx on public.stores (status, merchant_category);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger stores_set_updated_at
before update on public.stores
for each row execute function private.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_name text;
begin
  safe_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');

  insert into public.profiles (id, full_name)
  values (new.id, safe_name)
  on conflict (id) do nothing;

  -- Customer is the default trusted role. Do not read a role from user_metadata.
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || case
      when coalesce(raw_app_meta_data, '{}'::jsonb) ? 'role' then '{}'::jsonb
      else jsonb_build_object('role', 'customer')
    end
  where id = new.id;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.stores (owner_id, name, slug, merchant_category, status, is_platform_store)
values (null, 'SHAKH STORE', 'shakh-store', null, 'active', true)
on conflict (slug) do nothing;

alter table public.profiles enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy catalog_categories_public_read on public.catalog_categories
for select to anon, authenticated using (is_active = true);

create policy catalog_categories_admin_manage on public.catalog_categories
for all to authenticated
using (public.current_app_role() in ('admin', 'super_admin'))
with check (public.current_app_role() in ('admin', 'super_admin'));

create policy stores_public_and_owner_read on public.stores
for select to anon, authenticated
using (
  status = 'active'
  or owner_id = (select auth.uid())
  or public.current_app_role() in ('admin', 'super_admin')
);

create policy stores_insert_owner_category on public.stores
for insert to authenticated
with check (
  (
    public.current_app_role() in ('admin', 'super_admin')
    and (is_platform_store = false or public.current_app_role() = 'super_admin')
  )
  or
  (
    owner_id = (select auth.uid())
    and is_platform_store = false
    and (
      (merchant_category = 'restaurant' and public.current_app_role() = 'restaurant')
      or (merchant_category = 'supermarket' and public.current_app_role() = 'supermarket')
      or (merchant_category = 'fruits_vegetables' and public.current_app_role() = 'produce_vendor')
      or (merchant_category = 'meat_seafood' and public.current_app_role() = 'meat_seafood_vendor')
    )
  )
);

create policy stores_update_owner_or_admin on public.stores
for update to authenticated
using (
  owner_id = (select auth.uid())
  or public.current_app_role() in ('admin', 'super_admin')
)
with check (
  (
    owner_id = (select auth.uid())
    and is_platform_store = false
    and (
      (merchant_category = 'restaurant' and public.current_app_role() = 'restaurant')
      or (merchant_category = 'supermarket' and public.current_app_role() = 'supermarket')
      or (merchant_category = 'fruits_vegetables' and public.current_app_role() = 'produce_vendor')
      or (merchant_category = 'meat_seafood' and public.current_app_role() = 'meat_seafood_vendor')
    )
  )
  or (public.current_app_role() = 'admin' and is_platform_store = false)
  or public.current_app_role() = 'super_admin'
);

create policy products_public_read_published on public.products
for select to anon, authenticated
using (
  status = 'published' and is_available = true
  and exists (select 1 from public.stores s where s.id = products.store_id and s.status = 'active')
);

create policy products_owner_and_admin_read on public.products
for select to authenticated
using (
  exists (
    select 1 from public.stores s where s.id = products.store_id
    and (s.owner_id = (select auth.uid()) or public.current_app_role() in ('admin', 'super_admin'))
  )
);

create policy products_insert_store_scope on public.products
for insert to authenticated
with check (
  exists (
    select 1 from public.stores s where s.id = products.store_id
    and (
      (s.is_platform_store = true and public.current_app_role() = 'super_admin')
      or
      (
        s.is_platform_store = false and s.owner_id = (select auth.uid())
        and (
          (s.merchant_category = 'restaurant' and public.current_app_role() = 'restaurant')
          or (s.merchant_category = 'supermarket' and public.current_app_role() = 'supermarket')
          or (s.merchant_category = 'fruits_vegetables' and public.current_app_role() = 'produce_vendor')
          or (s.merchant_category = 'meat_seafood' and public.current_app_role() = 'meat_seafood_vendor')
        )
      )
      or (s.is_platform_store = false and public.current_app_role() = 'admin')
    )
  )
);

create policy products_update_store_scope on public.products
for update to authenticated
using (
  exists (
    select 1 from public.stores s where s.id = products.store_id
    and (
      (s.is_platform_store = true and public.current_app_role() = 'super_admin')
      or (s.is_platform_store = false and s.owner_id = (select auth.uid()))
      or (s.is_platform_store = false and public.current_app_role() = 'admin')
    )
  )
)
with check (
  exists (
    select 1 from public.stores s where s.id = products.store_id
    and (
      (s.is_platform_store = true and public.current_app_role() = 'super_admin')
      or
      (
        s.is_platform_store = false and s.owner_id = (select auth.uid())
        and (
          (s.merchant_category = 'restaurant' and public.current_app_role() = 'restaurant')
          or (s.merchant_category = 'supermarket' and public.current_app_role() = 'supermarket')
          or (s.merchant_category = 'fruits_vegetables' and public.current_app_role() = 'produce_vendor')
          or (s.merchant_category = 'meat_seafood' and public.current_app_role() = 'meat_seafood_vendor')
        )
      )
      or (s.is_platform_store = false and public.current_app_role() = 'admin')
    )
  )
);

grant usage on schema public to anon, authenticated;
grant select on public.catalog_categories, public.stores, public.products to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant insert, update on public.stores, public.products, public.catalog_categories to authenticated;

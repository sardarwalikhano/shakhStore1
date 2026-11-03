-- Remove broad default privileges that are not governed by row-level security.
revoke delete, truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

drop policy if exists catalog_categories_admin_delete on public.catalog_categories;
drop policy if exists profiles_insert_own on public.profiles;

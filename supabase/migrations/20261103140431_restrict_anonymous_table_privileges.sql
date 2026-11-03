-- Anonymous users may browse public catalog data, but never mutate public tables.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon;

revoke all privileges on public.profiles from anon;

grant select on public.catalog_categories, public.stores, public.products to anon;

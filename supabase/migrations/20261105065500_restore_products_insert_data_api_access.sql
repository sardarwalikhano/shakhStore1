-- Restore the Data API table-level INSERT grant for product creation,
-- while keeping moderation-controlled insert fields server-owned.
create or replace function private.enforce_product_insert_defaults_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Products must always enter the catalog as drafts and cannot be published
  -- or backdated by a direct authenticated Data API insert.
  new.id := pg_catalog.gen_random_uuid();
  new.status := 'draft';
  new.is_available := true;
  new.created_at := pg_catalog.now();
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

revoke all on function private.enforce_product_insert_defaults_v1()
  from public, anon, authenticated;

drop trigger if exists products_enforce_insert_defaults
  on public.products;

create trigger products_enforce_insert_defaults
before insert on public.products
for each row
execute function private.enforce_product_insert_defaults_v1();

grant insert on table public.products to authenticated;

notify pgrst, 'reload schema';

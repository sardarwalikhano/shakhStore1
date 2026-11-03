-- Keep sensitive workflow fields controlled by trusted server-side operations.
revoke insert, update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, preferred_locale)
  on public.profiles to authenticated;

revoke insert, update on public.stores from authenticated;
grant insert (owner_id, name, slug, merchant_category, description, logo_url, phone)
  on public.stores to authenticated;
grant update (name, slug, description, logo_url, phone)
  on public.stores to authenticated;

revoke insert, update on public.products from authenticated;
grant insert (
  store_id, category_id, name, description, sku,
  price_iqd, compare_at_price_iqd, stock_quantity, unit
) on public.products to authenticated;
grant update (
  category_id, name, description, sku, price_iqd,
  compare_at_price_iqd, stock_quantity, unit, is_available
) on public.products to authenticated;

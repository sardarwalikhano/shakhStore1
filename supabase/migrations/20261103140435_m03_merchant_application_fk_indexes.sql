-- Index foreign keys used by moderation and store detail joins.
create index merchant_applications_reviewed_by_idx
  on public.merchant_applications (reviewed_by);
create index merchant_applications_store_id_idx
  on public.merchant_applications (store_id);

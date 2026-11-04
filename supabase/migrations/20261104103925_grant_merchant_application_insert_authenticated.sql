-- Source for the already-applied migration 20261104103925.
-- The existing merchant_applications_insert_own RLS policy remains the
-- row-level authorization boundary; this grant only supplies INSERT privilege.
GRANT INSERT ON TABLE public.merchant_applications TO authenticated;

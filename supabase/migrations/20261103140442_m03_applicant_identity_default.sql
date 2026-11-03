-- Applicant identity is derived from the verified Supabase JWT.
alter table public.merchant_applications
  alter column applicant_id set default auth.uid();

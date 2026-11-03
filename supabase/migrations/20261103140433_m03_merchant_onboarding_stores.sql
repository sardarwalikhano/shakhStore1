-- M03: merchant onboarding, moderation and store ownership boundaries.
alter table public.stores
  add column contact_person text,
  add column city text,
  add column district text,
  add column address_line text;

alter table public.stores
  add constraint stores_contact_person_length
    check (contact_person is null or char_length(contact_person) between 2 and 120),
  add constraint stores_city_length
    check (city is null or char_length(city) between 2 and 100),
  add constraint stores_district_length
    check (district is null or char_length(district) between 2 and 120),
  add constraint stores_address_line_length
    check (address_line is null or char_length(address_line) <= 240);

create unique index stores_one_merchant_per_owner_idx
  on public.stores (owner_id)
  where owner_id is not null and is_platform_store = false;

create table public.merchant_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete restrict,
  business_name text not null,
  proposed_slug text,
  merchant_category text not null
    check (merchant_category in ('restaurant', 'supermarket', 'fruits_vegetables', 'meat_seafood')),
  description text,
  contact_person text not null,
  phone text not null,
  city text not null,
  district text not null,
  address_line text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  store_id uuid references public.stores(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_applications_business_name_length
    check (char_length(business_name) between 2 and 160),
  constraint merchant_applications_slug_format
    check (proposed_slug is null or (char_length(proposed_slug) between 2 and 80 and proposed_slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$')),
  constraint merchant_applications_description_length
    check (description is null or char_length(description) <= 2000),
  constraint merchant_applications_contact_person_length
    check (char_length(contact_person) between 2 and 120),
  constraint merchant_applications_phone_length
    check (char_length(phone) between 7 and 32),
  constraint merchant_applications_city_length
    check (char_length(city) between 2 and 100),
  constraint merchant_applications_district_length
    check (char_length(district) between 2 and 120),
  constraint merchant_applications_address_length
    check (char_length(address_line) between 3 and 240),
  constraint merchant_applications_review_note_length
    check (review_note is null or char_length(review_note) <= 1200),
  constraint merchant_applications_review_state
    check (
      (status in ('submitted', 'under_review') and reviewed_at is null and store_id is null)
      or (status = 'approved' and reviewed_at is not null and store_id is not null)
      or (status = 'rejected' and reviewed_at is not null and store_id is null)
    )
);

create unique index merchant_applications_one_open_per_applicant_idx
  on public.merchant_applications (applicant_id)
  where status in ('submitted', 'under_review');
create index merchant_applications_status_submitted_idx
  on public.merchant_applications (status, submitted_at);
create index merchant_applications_applicant_created_idx
  on public.merchant_applications (applicant_id, created_at desc);

create trigger merchant_applications_set_updated_at
before update on public.merchant_applications
for each row execute function private.set_updated_at();

alter table public.merchant_applications enable row level security;

create policy merchant_applications_select_own_or_admin
on public.merchant_applications for select to authenticated
using (
  applicant_id = (select auth.uid())
  or public.current_app_role() in ('admin', 'super_admin')
);
create policy merchant_applications_insert_own
on public.merchant_applications for insert to authenticated
with check (
  applicant_id = (select auth.uid())
  and status = 'submitted'
  and reviewed_by is null
  and reviewed_at is null
  and review_note is null
  and store_id is null
);

revoke all privileges on public.merchant_applications from anon, authenticated;
grant select on public.merchant_applications to authenticated;
grant insert (
  business_name, proposed_slug, merchant_category, description,
  contact_person, phone, city, district, address_line
) on public.merchant_applications to authenticated;
grant all privileges on public.merchant_applications to service_role;

revoke update on public.stores from authenticated;
grant update (
  name, slug, description, logo_url, phone,
  contact_person, city, district, address_line
) on public.stores to authenticated;
grant select, insert, update on public.stores to service_role;

create or replace function public.approve_merchant_application(
  p_application_id uuid,
  p_reviewer_id uuid,
  p_review_note text default null
)
returns table (store_id uuid, applicant_id uuid, merchant_category text)
language plpgsql
set search_path = ''
as $function$
declare
  v_application public.merchant_applications%rowtype;
  v_store_id uuid;
  v_slug text;
  v_suffix integer := 0;
begin
  select *
  into v_application
  from public.merchant_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'merchant_application_not_found' using errcode = 'P0002';
  end if;
  if v_application.status not in ('submitted', 'under_review') then
    raise exception 'merchant_application_not_reviewable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.stores
    where owner_id = v_application.applicant_id and is_platform_store = false
  ) then
    raise exception 'merchant_already_has_store' using errcode = '23505';
  end if;

  v_slug := coalesce(
    v_application.proposed_slug,
    'merchant-' || left(replace(v_application.id::text, '-', ''), 10)
  );
  while exists (select 1 from public.stores where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := left(
      coalesce(
        v_application.proposed_slug,
        'merchant-' || left(replace(v_application.id::text, '-', ''), 10)
      ),
      72
    ) || '-' || v_suffix::text;
  end loop;

  insert into public.stores (
    owner_id, name, slug, merchant_category, description, phone,
    contact_person, city, district, address_line, status, is_platform_store
  )
  values (
    v_application.applicant_id, v_application.business_name, v_slug,
    v_application.merchant_category, v_application.description, v_application.phone,
    v_application.contact_person, v_application.city, v_application.district,
    v_application.address_line, 'active', false
  )
  returning id into v_store_id;

  update public.merchant_applications
  set status = 'approved',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = nullif(left(btrim(coalesce(p_review_note, '')), 1200), ''),
      store_id = v_store_id
  where id = p_application_id;

  return query select v_store_id, v_application.applicant_id, v_application.merchant_category;
end;
$function$;

revoke all on function public.approve_merchant_application(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_merchant_application(uuid, uuid, text)
  to service_role;

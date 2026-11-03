-- M01: application roles, permission matrix and role-assignment audit.
-- Application roles live in trusted Supabase Auth app_metadata.role; they are not Postgres login roles.
create table public.app_roles (
  role text primary key check (role in ('super_admin','admin','restaurant','supermarket','produce_vendor','meat_seafood_vendor','captain','customer')),
  label_ckb text not null, label_en text not null,
  merchant_category text check (merchant_category is null or merchant_category in ('restaurant','supermarket','fruits_vegetables','meat_seafood')),
  description_ckb text not null default '', is_system boolean not null default true,
  sort_order integer not null, created_at timestamptz not null default now()
);
create table public.app_permissions (
  permission text primary key, module text not null, description_ckb text not null,
  created_at timestamptz not null default now(),
  constraint app_permissions_key_format check (permission ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);
create table public.role_permissions (
  role text not null references public.app_roles(role) on delete restrict,
  permission text not null references public.app_permissions(permission) on delete restrict,
  created_at timestamptz not null default now(), primary key(role,permission)
);
create table public.role_assignment_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  previous_role text references public.app_roles(role) on delete restrict,
  new_role text not null references public.app_roles(role) on delete restrict,
  reason text not null check(char_length(reason) between 2 and 1200),
  created_at timestamptz not null default now(),
  constraint role_assignment_no_noop check(previous_role is distinct from new_role)
);
create index role_assignment_events_target_created_idx on public.role_assignment_events(target_user_id,created_at desc);
create index role_assignment_events_actor_created_idx on public.role_assignment_events(actor_user_id,created_at desc);

insert into public.app_roles(role,label_ckb,label_en,merchant_category,description_ckb,sort_order) values
('super_admin','بەڕێوەبەری گشتی','Super Admin',null,'دەسەڵاتی تەواوی بەڕێوەبردنی پلاتفۆرم',1),
('admin','بەڕێوەبەر','Admin',null,'بەڕێوەبردنی کارە ڕۆژانەکان بە سنووری مۆڵەت',2),
('restaurant','چێشتخانە','Restaurant','restaurant','بەڕێوەبردنی چێشتخانە و بەرهەمەکانی خۆی',3),
('supermarket','سوپەرمارکێت','Supermarket','supermarket','بەڕێوەبردنی سوپەرمارکێت و کاڵاکانی خۆی',4),
('produce_vendor','فرۆشیاری سەوزە و میوە','Produce Vendor','fruits_vegetables','بەڕێوەبردنی فرۆشگای سەوزە و میوەی خۆی',5),
('meat_seafood_vendor','فرۆشیاری گۆشت و سپیاتی','Meat & Seafood Vendor','meat_seafood','بەڕێوەبردنی فرۆشگای گۆشت و سپیاتی خۆی',6),
('captain','کاپتن','Captain',null,'بەڕێوەبردنی گەیاندنە سپێردراوەکان',7),
('customer','کڕیار','Customer',null,'کڕین و بەڕێوەبردنی داواکارییە تایبەتییەکان',8)
on conflict(role) do nothing;

insert into public.app_permissions(permission,module,description_ckb) values
('profile.read_own','profile','بینینی پرۆفایلی خۆی'),
('profile.update_own','profile','نوێکردنەوەی پرۆفایلی خۆی'),
('catalog.browse','catalog','گەڕان لە کاتەلۆگی گشتی'),
('catalog.manage_categories','catalog','بەڕێوەبردنی پۆلەکان'),
('catalog.manage_all_products','catalog','بەڕێوەبردنی هەموو بەرهەمەکان'),
('catalog.manage_platform_products','catalog','بەڕێوەبردنی بەرهەمەکانی Shakh Store'),
('merchant.manage_store_own','merchant','بەڕێوەبردنی فرۆشگای خۆی'),
('merchant.manage_products_own','merchant','بەڕێوەبردنی بەرهەمەکانی فرۆشگای خۆی'),
('merchant.view_orders_own','merchant','بینینی داواکارییەکانی فرۆشگای خۆی'),
('merchant.update_orders_own','merchant','نوێکردنەوەی دۆخی داواکارییەکانی خۆی'),
('merchant.apply','merchant','ناردنی داواکاری بەشداربوون وەک فرۆشیار'),
('stores.review_applications','stores','پشکنینی داواکاریی فرۆشیاران'),
('stores.moderate','stores','چالاککردن و ڕاگرتنی فرۆشگا'),
('stores.view_all','stores','بینینی هەموو فرۆشگاکان'),
('orders.create','orders','دروستکردنی داواکاری'),
('orders.view_own','orders','بینینی داواکارییەکانی خۆی'),
('orders.manage_all','orders','بەڕێوەبردنی هەموو داواکارییەکان'),
('delivery.view_assigned','delivery','بینینی گەیاندنە سپێردراوەکان'),
('delivery.update_assigned','delivery','نوێکردنەوەی دۆخی گەیاندنی سپێردراو'),
('delivery.location.update','delivery','نوێکردنەوەی شوێنی کاپتن'),
('delivery.manage_all','delivery','بەڕێوەبردنی هەموو گەیاندنەکان'),
('wallet.view_own','wallet','بینینی جزدانی خۆی'),
('wallet.topup_own','wallet','داوای پڕکردنەوەی جزدان'),
('wallet.manage_all','wallet','بەڕێوەبردنی جزدان و مامەڵە داراییەکان'),
('finance.view_reports','finance','بینینی ڕاپۆرتی دارایی'),
('users.view_limited','users','بینینی زانیاری بەکارهێنەران بە سنووری مۆڵەت'),
('users.manage_roles','users','گۆڕینی ڕۆڵی بەکارهێنەر'),
('users.manage_access','users','ڕاگرتن و چالاککردنی دەستڕاگەیشتن'),
('addresses.manage_own','addresses','بەڕێوەبردنی ناونیشانی خۆی'),
('rewards.view_own','rewards','بینینی خاڵ و خەڵاتی خۆی'),
('settings.manage_platform','settings','بەڕێوەبردنی ڕێکخستنەکانی پلاتفۆرم')
on conflict(permission) do nothing;

insert into public.role_permissions(role,permission)
select 'super_admin',permission from public.app_permissions on conflict do nothing;
insert into public.role_permissions(role,permission) values
('admin','profile.read_own'),('admin','profile.update_own'),('admin','catalog.browse'),('admin','catalog.manage_categories'),('admin','catalog.manage_all_products'),
('admin','stores.review_applications'),('admin','stores.moderate'),('admin','stores.view_all'),('admin','orders.manage_all'),('admin','delivery.manage_all'),('admin','finance.view_reports'),('admin','users.view_limited'),
('restaurant','profile.read_own'),('restaurant','profile.update_own'),('restaurant','catalog.browse'),('restaurant','merchant.manage_store_own'),('restaurant','merchant.manage_products_own'),('restaurant','merchant.view_orders_own'),('restaurant','merchant.update_orders_own'),('restaurant','wallet.view_own'),
('supermarket','profile.read_own'),('supermarket','profile.update_own'),('supermarket','catalog.browse'),('supermarket','merchant.manage_store_own'),('supermarket','merchant.manage_products_own'),('supermarket','merchant.view_orders_own'),('supermarket','merchant.update_orders_own'),('supermarket','wallet.view_own'),
('produce_vendor','profile.read_own'),('produce_vendor','profile.update_own'),('produce_vendor','catalog.browse'),('produce_vendor','merchant.manage_store_own'),('produce_vendor','merchant.manage_products_own'),('produce_vendor','merchant.view_orders_own'),('produce_vendor','merchant.update_orders_own'),('produce_vendor','wallet.view_own'),
('meat_seafood_vendor','profile.read_own'),('meat_seafood_vendor','profile.update_own'),('meat_seafood_vendor','catalog.browse'),('meat_seafood_vendor','merchant.manage_store_own'),('meat_seafood_vendor','merchant.manage_products_own'),('meat_seafood_vendor','merchant.view_orders_own'),('meat_seafood_vendor','merchant.update_orders_own'),('meat_seafood_vendor','wallet.view_own'),
('captain','profile.read_own'),('captain','profile.update_own'),('captain','delivery.view_assigned'),('captain','delivery.update_assigned'),('captain','delivery.location.update'),('captain','wallet.view_own'),
('customer','profile.read_own'),('customer','profile.update_own'),('customer','catalog.browse'),('customer','orders.create'),('customer','orders.view_own'),('customer','wallet.view_own'),('customer','wallet.topup_own'),('customer','addresses.manage_own'),('customer','rewards.view_own'),('customer','merchant.apply')
on conflict do nothing;

alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_assignment_events enable row level security;
create policy app_roles_read_authenticated on public.app_roles for select to authenticated using(true);
create policy app_permissions_read_authenticated on public.app_permissions for select to authenticated using(true);
create policy role_permissions_read_authenticated on public.role_permissions for select to authenticated using(true);
create policy role_assignment_events_read_super_admin on public.role_assignment_events for select to authenticated using(public.current_app_role()='super_admin');
revoke all privileges on public.app_roles,public.app_permissions,public.role_permissions,public.role_assignment_events from anon,authenticated;
grant select on public.app_roles,public.app_permissions,public.role_permissions to authenticated;
grant select on public.role_assignment_events to authenticated;
grant all privileges on public.app_roles,public.app_permissions,public.role_permissions,public.role_assignment_events to service_role;

create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.role_permissions rp where rp.role=public.current_app_role() and rp.permission=p_permission); $$;
revoke all on function public.has_permission(text) from public,anon;
grant execute on function public.has_permission(text) to authenticated;
comment on table public.app_roles is 'Application roles stored as trusted Supabase Auth app_metadata.role claims; not PostgreSQL login roles.';
comment on table public.role_permissions is 'Application-level RBAC permission matrix used alongside RLS.';
comment on table public.role_assignment_events is 'Append-only audit trail for trusted role changes; never editable by client users.';

-- M17: store-specific delivery fee snapshots and validated delivery split.
-- This migration is additive; checkout and captain settlement RPCs must consume
-- these fields in the follow-up integration migration before enabling the feature.
alter table public.stores
  add column if not exists delivery_fee_iqd bigint not null default 0
  check (delivery_fee_iqd >= 0);

alter table public.order_stores
  add column if not exists delivery_fee_iqd bigint not null default 0
  check (delivery_fee_iqd >= 0),
  add column if not exists delivery_platform_commission_iqd bigint not null default 0
  check (delivery_platform_commission_iqd >= 0),
  add column if not exists captain_delivery_earning_iqd bigint not null default 0
  check (captain_delivery_earning_iqd >= 0);

-- Stable split math in integer IQD: platform receives 20%, captain receives
-- the remainder. Rounding remainder is assigned to captain, preserving totals.
create or replace function public.calculate_store_delivery_split_v1(
  p_delivery_fee_iqd bigint
)
returns table (
  delivery_fee_iqd bigint,
  platform_commission_iqd bigint,
  captain_earning_iqd bigint
)
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
begin
  if p_delivery_fee_iqd is null or p_delivery_fee_iqd < 0 then
    raise exception 'INVALID_DELIVERY_FEE' using errcode = '22023';
  end if;

  return query
  select
    p_delivery_fee_iqd,
    floor(p_delivery_fee_iqd::numeric * 0.20)::bigint,
    p_delivery_fee_iqd - floor(p_delivery_fee_iqd::numeric * 0.20)::bigint;
end;
$function$;

revoke all on function public.calculate_store_delivery_split_v1(bigint) from public, anon;
grant execute on function public.calculate_store_delivery_split_v1(bigint) to authenticated;

comment on column public.stores.delivery_fee_iqd is
  'Admin-configured fixed delivery fee per store, in integer IQD.';
comment on column public.order_stores.delivery_fee_iqd is
  'Immutable-at-checkout store delivery fee snapshot, in integer IQD.';
comment on column public.order_stores.delivery_platform_commission_iqd is
  '20 percent platform share of the store delivery fee, in integer IQD.';
comment on column public.order_stores.captain_delivery_earning_iqd is
  'Captain share (80 percent, with integer rounding remainder) of store delivery fee, in integer IQD.';

create unique index if not exists delivery_zones_city_district_normalized_uidx
on public.delivery_zones (
  lower(btrim(city)),
  lower(btrim(coalesce(district, '')))
);

create or replace function private.manage_delivery_zone_v1(
  p_zone_id uuid,
  p_name_ckb text,
  p_city text,
  p_district text,
  p_base_fee_iqd bigint,
  p_per_km_fee_iqd bigint,
  p_minimum_fee_iqd bigint,
  p_maximum_fee_iqd bigint,
  p_maximum_distance_km numeric,
  p_is_active boolean
)
returns public.delivery_zones
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := public.current_app_role();
  v_zone public.delivery_zones%rowtype;
  v_city text := btrim(coalesce(p_city, ''));
  v_district text := nullif(btrim(coalesce(p_district, '')), '');
  v_name text := btrim(coalesce(p_name_ckb, ''));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role not in ('admin', 'super_admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120
     or char_length(v_city) < 2 or char_length(v_city) > 100
     or (v_district is not null and char_length(v_district) > 120) then
    raise exception 'INVALID_ZONE_LABEL_OR_LOCATION' using errcode = '22023';
  end if;
  if p_base_fee_iqd is null or p_base_fee_iqd < 0
     or p_per_km_fee_iqd is null or p_per_km_fee_iqd < 0
     or p_minimum_fee_iqd is null or p_minimum_fee_iqd < 0
     or (p_maximum_fee_iqd is not null and p_maximum_fee_iqd < p_minimum_fee_iqd)
     or (p_maximum_distance_km is not null and p_maximum_distance_km <= 0) then
    raise exception 'INVALID_DELIVERY_FEE_CONFIGURATION' using errcode = '22023';
  end if;
  if coalesce(p_is_active, false)
     and (p_per_km_fee_iqd <> 0 or p_maximum_distance_km is not null) then
    raise exception 'DISTANCE_PRICING_NOT_SUPPORTED_YET' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lower(v_city) || ':' || lower(coalesce(v_district, '')), 0)
  );

  if exists (
    select 1 from public.delivery_zones z
    where lower(btrim(z.city)) = lower(v_city)
      and lower(btrim(coalesce(z.district, ''))) = lower(coalesce(v_district, ''))
      and (p_zone_id is null or z.id <> p_zone_id)
  ) then
    raise exception 'DELIVERY_ZONE_ALREADY_EXISTS' using errcode = '23505';
  end if;

  if p_zone_id is null then
    insert into public.delivery_zones (
      name_ckb, city, district, base_fee_iqd, per_km_fee_iqd,
      minimum_fee_iqd, maximum_fee_iqd, maximum_distance_km, is_active
    )
    values (
      v_name, v_city, v_district, p_base_fee_iqd, p_per_km_fee_iqd,
      p_minimum_fee_iqd, p_maximum_fee_iqd, p_maximum_distance_km, coalesce(p_is_active, false)
    )
    returning * into v_zone;
  else
    update public.delivery_zones
    set name_ckb = v_name,
        city = v_city,
        district = v_district,
        base_fee_iqd = p_base_fee_iqd,
        per_km_fee_iqd = p_per_km_fee_iqd,
        minimum_fee_iqd = p_minimum_fee_iqd,
        maximum_fee_iqd = p_maximum_fee_iqd,
        maximum_distance_km = p_maximum_distance_km,
        is_active = coalesce(p_is_active, false),
        updated_at = now()
    where id = p_zone_id
    returning * into v_zone;
    if not found then
      raise exception 'DELIVERY_ZONE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  return v_zone;
end;
$function$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.manage_delivery_zone_v1(uuid,text,text,text,bigint,bigint,bigint,bigint,numeric,boolean)
  from public, anon, authenticated;
grant execute on function private.manage_delivery_zone_v1(uuid,text,text,text,bigint,bigint,bigint,bigint,numeric,boolean)
  to authenticated;

create or replace function public.manage_delivery_zone_v1(
  p_zone_id uuid,
  p_name_ckb text,
  p_city text,
  p_district text,
  p_base_fee_iqd bigint,
  p_per_km_fee_iqd bigint,
  p_minimum_fee_iqd bigint,
  p_maximum_fee_iqd bigint,
  p_maximum_distance_km numeric,
  p_is_active boolean
)
returns public.delivery_zones
language sql
security invoker
set search_path = ''
as $function$
  select private.manage_delivery_zone_v1(
    p_zone_id, p_name_ckb, p_city, p_district, p_base_fee_iqd,
    p_per_km_fee_iqd, p_minimum_fee_iqd, p_maximum_fee_iqd,
    p_maximum_distance_km, p_is_active
  );
$function$;

revoke all on function public.manage_delivery_zone_v1(uuid,text,text,text,bigint,bigint,bigint,bigint,numeric,boolean)
  from public, anon;
grant execute on function public.manage_delivery_zone_v1(uuid,text,text,text,bigint,bigint,bigint,bigint,numeric,boolean)
  to authenticated;

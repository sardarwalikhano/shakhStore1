do $migration$
begin
  if exists (
    select 1
    from public.delivery_zones
    where lower(btrim(city)) = lower(btrim('بەردەڕەش'))
      and lower(btrim(coalesce(district, ''))) = ''
  ) then
    update public.delivery_zones
    set name_ckb = 'بەردەڕەش',
        city = 'بەردەڕەش',
        district = null,
        base_fee_iqd = 1000,
        per_km_fee_iqd = 0,
        minimum_fee_iqd = 0,
        maximum_fee_iqd = null,
        maximum_distance_km = null,
        is_active = true,
        updated_at = now()
    where lower(btrim(city)) = lower(btrim('بەردەڕەش'))
      and lower(btrim(coalesce(district, ''))) = '';
  else
    insert into public.delivery_zones (
      name_ckb,
      city,
      district,
      base_fee_iqd,
      per_km_fee_iqd,
      minimum_fee_iqd,
      maximum_fee_iqd,
      maximum_distance_km,
      is_active
    )
    values (
      'بەردەڕەش',
      'بەردەڕەش',
      null,
      1000,
      0,
      0,
      null,
      null,
      true
    );
  end if;
end;
$migration$;

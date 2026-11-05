-- M21: apply per-store delivery fee snapshots at order-store creation.
-- Updates persisted order totals after all store rows are inserted; checkout RPC
-- response is refreshed by the subsequent checkout-function integration.
create or replace function private.snapshot_store_delivery_fee_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_fee bigint;
 v_platform bigint;
 v_captain bigint;
begin
 select s.delivery_fee_iqd into v_fee from public.stores s where s.id=new.store_id;
 if not found or v_fee is null or v_fee<0 then
  raise exception 'STORE_DELIVERY_FEE_INVALID' using errcode='22023';
 end if;
 select x.platform_commission_iqd,x.captain_earning_iqd
 into v_platform,v_captain
 from public.calculate_store_delivery_split_v1(v_fee) x;
 new.delivery_fee_iqd:=v_fee;
 new.delivery_platform_commission_iqd:=v_platform;
 new.captain_delivery_earning_iqd:=v_captain;
 return new;
end;
$$;
revoke all on function private.snapshot_store_delivery_fee_v1() from public,anon,authenticated;

create or replace function private.refresh_order_store_delivery_total_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_order_id uuid;
 v_fee_total bigint;
begin
 v_order_id:=coalesce(new.order_id,old.order_id);
 select coalesce(sum(os.delivery_fee_iqd),0)::bigint into v_fee_total
 from public.order_stores os where os.order_id=v_order_id;
 update public.orders o
 set delivery_fee_iqd=v_fee_total,
     total_iqd=o.items_subtotal_iqd-v_coalesce_discount(o.discount_iqd)+v_fee_total+o.tax_iqd,
     updated_at=now()
 where o.id=v_order_id;
 return coalesce(new,old);
end;
$$;

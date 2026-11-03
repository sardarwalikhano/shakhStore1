import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { CheckoutForm, type CheckoutAddress } from "@/components/checkout-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [addressResult, zoneResult] = await Promise.all([
    supabase.from("customer_addresses")
      .select("id,label,recipient_name,phone,city,district,address_line,is_default,is_active")
      .eq("customer_id", user.id).eq("is_active", true).order("is_default", {ascending:false}).order("created_at", {ascending:false}),
    supabase.from("delivery_zones")
      .select("city,district,base_fee_iqd,minimum_fee_iqd,maximum_fee_iqd,per_km_fee_iqd")
      .eq("is_active", true),
  ]);

  const zones = zoneResult.data ?? [];
  const addresses: CheckoutAddress[] = (addressResult.data ?? []).map(address => {
    const zone = zones
      .filter(item =>
        item.city.trim().toLowerCase() === address.city.trim().toLowerCase()
        && (item.district === null || item.district.trim().toLowerCase() === address.district.trim().toLowerCase())
      )
      .sort((a,b)=>(a.district===null?1:0)-(b.district===null?1:0))[0];
    const fee = zone && zone.per_km_fee_iqd === 0
      ? Math.min(zone.maximum_fee_iqd ?? Number.MAX_SAFE_INTEGER, Math.max(zone.base_fee_iqd, zone.minimum_fee_iqd))
      : null;
    return {
      id: address.id,
      label: address.label,
      recipientName: address.recipient_name,
      phone: address.phone,
      city: address.city,
      district: address.district,
      addressLine: address.address_line,
      isDefault: address.is_default,
      serviceable: fee !== null,
      deliveryFeeIqd: fee,
    };
  });

  return (
    <>
      <SiteHeader />
      <main className="container section checkout-page">
        <Link href="/cart" className="text-link"><ArrowRight size={17} /> گەڕانەوە بۆ سەبەتە</Link>
        <div className="section-heading" style={{marginTop:22}}><div><h1>تەواوکردنی داواکاری</h1><p>ناونیشان و شێوازی پارەدان پشتڕاست بکەرەوە.</p></div></div>
        <CheckoutForm addresses={addresses} hasAnyActiveZone={zones.length > 0} />
      </main>
    </>
  );
}
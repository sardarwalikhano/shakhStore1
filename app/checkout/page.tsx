import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CheckoutForm, type CheckoutAddress } from "@/components/checkout-form";
import { SiteHeader } from "@/components/site-header";
import {
  calculateFlatDeliveryFee,
  resolveDeliveryZone,
} from "@/lib/marketplace-rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "customer") redirect("/dashboard");

  const [addressResult, zoneResult] = await Promise.all([
    supabase.from("customer_addresses")
      .select("id,label,recipient_name,phone,city,district,address_line,is_default,is_active")
      .eq("customer_id", user.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("delivery_zones")
      .select("city,district,is_active,base_fee_iqd,minimum_fee_iqd,maximum_fee_iqd,per_km_fee_iqd")
      .eq("is_active", true),
  ]);

  const hasDataLoadError = Boolean(addressResult.error || zoneResult.error);
  const zones = zoneResult.data ?? [];
  const addresses: CheckoutAddress[] = (addressResult.data ?? []).map((address) => {
    const zone = resolveDeliveryZone(zones, address.city, address.district);
    const fee = calculateFlatDeliveryFee(zone);
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
        <div className="section-heading" style={{ marginTop: 22 }}>
          <div><h1>تەواوکردنی داواکاری</h1><p>ناونیشان و شێوازی پارەدان پشتڕاست بکەرەوە.</p></div>
        </div>
        <CheckoutForm
          addresses={addresses}
          hasAnyActiveZone={zones.length > 0}
          dataLoadError={hasDataLoadError}
        />
      </main>
    </>
  );
}

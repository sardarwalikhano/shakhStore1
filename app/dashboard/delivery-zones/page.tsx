import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DeliveryZoneManager } from "@/components/delivery-zone-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DeliveryZonesPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role;
  if (role !== "admin" && role !== "super_admin") {
    return <main className="container section"><div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong><Link href="/dashboard" className="text-link">گەڕانەوە بۆ داشبۆرد</Link></div></main>;
  }

  const { data: zones, error } = await supabase.from("delivery_zones")
    .select("*")
    .order("city")
    .order("district");

  return (
    <main className="container section delivery-zones-page">
      <Link href="/dashboard" className="text-link"><ArrowRight size={17} /> گەڕانەوە بۆ داشبۆرد</Link>
      <div className="section-heading" style={{marginTop:22}}><div><h1>بەڕێوەبردنی ناوچەی گەیاندن</h1><p>ناوچە و کرێی ڕاستەقینەی گەیاندن ڕێکبخە بۆ ئەوەی Checkout چالاک بێت.</p></div></div>
      {error ? <div className="empty-state"><strong>نەتوانرا ناوچەکان بخوێندرێنەوە</strong><span className="muted">دەستڕاگەیشتنی داتابەیس پشکنە.</span></div> : <DeliveryZoneManager initialZones={zones ?? []} />}
    </main>
  );
}
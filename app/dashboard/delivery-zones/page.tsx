import { redirect } from "next/navigation";
import { DeliveryZoneManager } from "@/components/delivery-zone-manager";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DeliveryZonesPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roleValue = user.app_metadata?.role;
  const role = roleValue === "admin" || roleValue === "super_admin" ? roleValue : null;
  const { data: zones, error } = await supabase.from("delivery_zones")
    .select("*")
    .order("city")
    .order("district");

  return (
    <DashboardFrame
      identity={{
        name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
        email: user.email ?? null,
        role,
      }}
      title="بەڕێوەبردنی ناوچەی گەیاندن"
      subtitle="ناوچە و کرێی ڕاستەقینەی گەیاندن ڕێکبخە."
      activePath="/dashboard/delivery-zones"
    >
      {role === null ? (
        <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
      ) : error ? (
        <div className="empty-state"><strong>نەتوانرا ناوچەکان بخوێندرێنەوە</strong><span className="muted">دەستڕاگەیشتنی داتابەیس پشکنە.</span></div>
      ) : (
        <DeliveryZoneManager initialZones={zones ?? []} />
      )}
    </DashboardFrame>
  );
}

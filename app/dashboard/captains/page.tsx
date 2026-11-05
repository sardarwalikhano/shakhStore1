import { redirect } from "next/navigation";
import { CaptainManager } from "@/components/captain-manager";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CaptainsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "super_admin") redirect("/dashboard");

  const [{ data: captains, error: captainError }, { data: zones, error: zoneError }] = await Promise.all([
    supabase.rpc("admin_list_captain_scopes_v1"),
    supabase.from("delivery_zones").select("id,name_ckb,city,district,is_active").order("city").order("district"),
  ]);

  return (
    <DashboardFrame
      identity={{
        name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
        email: user.email ?? null,
        role: "super_admin",
      }}
      title="بەڕێوەبردنی کاپتنەکان"
      subtitle="کاپتن بانگهێشت بکە، ڕۆڵی کاپتن بۆ هەژماری هەبوو دابنێ و دەستڕاگەیشتنی بە زۆنەکان سنووردار بکە."
      activePath="/dashboard/captains"
    >
      {captainError || zoneError ? (
        <div className="empty-state">
          <strong>نەتوانرا زانیاری کاپتن و زۆنەکان بخوێندرێتەوە</strong>
          <span className="muted">مۆڵەتی RPC و RLS پشکنە.</span>
        </div>
      ) : (
        <CaptainManager
          initialCaptains={(captains ?? []).map((captain) => ({
            ...captain,
            scope_type: captain.scope_type === "global" ? "global" as const : "zones" as const,
            zone_ids: captain.zone_ids ?? [],
            is_active: Boolean(captain.is_active),
          }))}
          zones={zones ?? []}
        />
      )}
    </DashboardFrame>
  );
}

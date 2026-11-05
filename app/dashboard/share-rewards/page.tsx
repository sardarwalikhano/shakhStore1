import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard-frame";
import { ShareRewardClaimsManager, type ShareRewardClaimView } from "@/components/share-reward-claims-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ShareRewardsDashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role;
  const isAdmin = role === "super_admin";
  const isCustomer = role === "customer";
  const identity = {
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
    email: user.email ?? null,
    role: isAdmin ? "super_admin" as const : isCustomer ? "customer" as const : null,
  };

  if (!isAdmin && !isCustomer) {
    return (
      <DashboardFrame identity={identity} title="پاداشتی هاوبەشکردن" subtitle="ئەم بەشە بۆ کڕیاران و سوپەر ئەدمینە." activePath="/dashboard/share-rewards">
        <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
      </DashboardFrame>
    );
  }

  let claimsQuery = supabase.from("post_share_reward_claims")
    .select("id,post_id,post_title_snapshot,post_slug_snapshot,customer_user_id,reward_amount_iqd,proof_url,status,created_at,review_note")
    .order("created_at", { ascending: false })
    .limit(200);
  if (isCustomer) claimsQuery = claimsQuery.eq("customer_user_id", user.id);
  const { data: rows, error } = await claimsQuery;

  let customerNames = new Map<string, string>();
  if (isAdmin && (rows ?? []).length > 0) {
    const ids = [...new Set((rows ?? []).map((claim) => claim.customer_user_id))];
    const { data: profiles } = await supabase.from("profiles")
      .select("id,full_name")
      .in("id", ids);
    customerNames = new Map((profiles ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || "کڕیار",
    ]));
  }

  const claims: ShareRewardClaimView[] = (rows ?? []).map((claim) => ({
    ...claim,
    status: claim.status as ShareRewardClaimView["status"],
    customer_name: isAdmin ? customerNames.get(claim.customer_user_id) ?? "کڕیار" : "هەژماری من",
  }));

  return (
    <DashboardFrame
      identity={identity}
      title={isAdmin ? "پشکنینی داواکاری پاداشت" : "پاداشتی هاوبەشکردنی من"}
      subtitle={isAdmin
        ? "بەڵگەی هاوبەشکردن بپشکنە؛ تەنها دوای پشتڕاستکردنەوە پاداشت بۆ جزدانی کڕیار بنێرە."
        : "داواکاری پاداشتەکانت و دۆخی پشکنین و گواستنەوەی پارە لێرە ببینە."}
      activePath="/dashboard/share-rewards"
    >
      {error ? (
        <div className="empty-state">
          <strong>نەتوانرا داواکارییەکانی پاداشت بخوێندرێنەوە</strong>
          <span className="muted">RLS و دەستڕاگەیشتنی Supabase پشکنە.</span>
        </div>
      ) : (
        <ShareRewardClaimsManager claims={claims} mode={isAdmin ? "admin" : "customer"} />
      )}
    </DashboardFrame>
  );
}

import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMerchantCategoryForRole } from "@/lib/post-rules";

export const dynamic = "force-dynamic";

type ReferralRow = {
  id: string;
  post_id: string;
  order_store_id: string;
  sharer_user_id: string;
  store_id: string;
  reward_amount_iqd: number;
  status: "pending" | "pending_wallet" | "paid";
  created_at: string;
  paid_at: string | null;
};

export default async function ShareRewardsDashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;
  const isAdmin = role === "super_admin";
  const isCustomer = role === "customer";
  const merchantCategory = getMerchantCategoryForRole(role);
  const isMerchant = merchantCategory !== null;
  const dashboardRole = isAdmin ? "super_admin" as const
    : isCustomer ? "customer" as const
    : isMerchant ? role as "restaurant" | "supermarket" | "produce_vendor" | "meat_seafood_vendor"
    : null;
  const identity = {
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
    email: user.email ?? null,
    role: dashboardRole,
  };

  if (!isAdmin && !isCustomer && !isMerchant) {
    return (
      <DashboardFrame identity={identity} title="پاداشتی هاوبەشکردن" subtitle="ئەم بەشە بۆ کڕیاران، دوکانداران و سوپەر ئەدمینە." activePath="/dashboard/share-rewards">
        <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
      </DashboardFrame>
    );
  }

  let storeIds: string[] = [];
  if (isMerchant) {
    const { data: stores } = await supabase.from("stores")
      .select("id").eq("owner_id", user.id).eq("merchant_category", merchantCategory)
      .eq("is_platform_store", false);
    storeIds = (stores ?? []).map((store) => store.id);
  }

  let query = supabase.from("post_share_order_attributions")
    .select("id,post_id,order_store_id,sharer_user_id,store_id,reward_amount_iqd,status,created_at,paid_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (isCustomer) query = query.eq("sharer_user_id", user.id);
  else if (isMerchant) query = storeIds.length ? query.in("store_id", storeIds) : query.eq("store_id", "00000000-0000-0000-0000-000000000000");
  const { data, error } = await query;
  const rows = (data ?? []) as ReferralRow[];
  const postIds = [...new Set(rows.map((row) => row.post_id))];
  const { data: posts } = postIds.length
    ? await supabase.from("posts").select("id,title,slug").in("id", postIds)
    : { data: [], error: null };
  const titles = new Map((posts ?? []).map((post) => [post.id, post.title]));
  const totalPaid = rows.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.reward_amount_iqd, 0);
  const totalPending = rows.filter((row) => row.status !== "paid").reduce((sum, row) => sum + row.reward_amount_iqd, 0);

  return (
    <DashboardFrame
      identity={identity}
      title={isAdmin ? "چاودێری خەڵاتی شێر" : isMerchant ? "خەڵاتی کڕینەکانم" : "کڕین و خەڵاتەکانی من"}
      subtitle={isAdmin
        ? "هەموو پاداشتەکانی بەستراو بە کڕینی تەواوبوو و دۆخی گواستنەوەی پارە."
        : isMerchant
          ? "هەر خەڵاتێک کە لە جزدانی فرۆشگاکەت کەم دەکرێتەوە، لێرە دەبینرێت."
          : "هەر داواکارییەک کە لە لینکی تۆوە بکرێت و بگەیەنرێت، لێرە وەک خەڵات تۆمار دەکرێت."}
      activePath="/dashboard/share-rewards"
    >
      {error ? (
        <div className="empty-state"><strong>نەتوانرا مێژووی خەڵاتەکان بخوێندرێتەوە</strong><span className="muted">دەستڕاگەیشتنی داتابەیس پشکنە.</span></div>
      ) : (
        <>
          <section className="dashboard-stats-grid">
            <article className="dashboard-stat-card"><span>کڕینە پەیوەستەکان</span><strong>{rows.length.toLocaleString("en-US")}</strong></article>
            <article className="dashboard-stat-card"><span>خەڵاتی دراو</span><strong>{totalPaid.toLocaleString("en-US")} دینار</strong></article>
            <article className="dashboard-stat-card"><span>خەڵاتی چاوەڕوان</span><strong>{totalPending.toLocaleString("en-US")} دینار</strong></article>
          </section>
          <section className="dashboard-panel">
            <div className="section-heading"><div><h2><Gift size={18} /> مێژووی کڕینەکان</h2><p>خەڵات تەنها دوای گەیاندنی داواکاری لە جزدانی خاوەنی پۆست کەم و بۆ جزدانی خاوەن لینک زیاد دەکرێت.</p></div></div>
            {rows.length === 0 ? (
              <div className="empty-state"><strong>هێشتا کڕینێکی خەڵاتدار تۆمار نەکراوە.</strong><span className="muted">{isMerchant ? "دوای کڕینی تەواوبوو، دۆخی پارەدان لێرە دەردەکەوێت." : "لینکی تایبەتی پۆستێکی خەڵاتدار دروست بکە و هاوبەشی بکە."}</span></div>
            ) : (
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>پۆست</th><th>بڕی خەڵات</th><th>دۆخ</th><th>کات</th></tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.id}>
                    <td>{titles.get(row.post_id) ?? "پۆستی ئەرشیفکراو"}</td>
                    <td>{row.reward_amount_iqd.toLocaleString("en-US")} دینار</td>
                    <td>{row.status === "paid" ? "دراوە" : row.status === "pending_wallet" ? "چاوەڕێی پڕکردنەوەی جزدان" : "چاوەڕێی گەیاندن"}</td>
                    <td>{new Date(row.paid_at ?? row.created_at).toLocaleString("ckb-IQ")}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </>
      )}
    </DashboardFrame>
  );
}

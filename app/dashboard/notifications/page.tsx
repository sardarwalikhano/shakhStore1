import { redirect } from "next/navigation";
import { Bell, CheckCircle2, Wallet } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationsDashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" ? rawRole : null;
  const allowedRoles = ["super_admin","admin","restaurant","supermarket","produce_vendor","meat_seafood_vendor","captain","customer"];
  const dashboardRole = allowedRoles.includes(role ?? "") ? role as "super_admin" | "admin" | "restaurant" | "supermarket" | "produce_vendor" | "meat_seafood_vendor" | "captain" | "customer" : null;
  const identity = {
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
    email: user.email ?? null,
    role: dashboardRole,
  };
  const { data, error } = await supabase.from("user_notifications")
    .select("id,notification_type,title,body,metadata,created_at,read_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <DashboardFrame identity={identity} title="ئاگادارکردنەوەکان" subtitle="ئاگادارییەکانی جزدان، دوکان و خەڵاتی شێر." activePath="/dashboard/notifications">
      {error ? (
        <div className="empty-state"><strong>نەتوانرا ئاگادارییەکان بخوێندرێنەوە</strong><span className="muted">پەیوەندی و RLSی داتابەیس پشکنە.</span></div>
      ) : !data?.length ? (
        <div className="empty-state"><Bell size={30} /><strong>هیچ ئاگادارکردنەوەیەک نییە.</strong></div>
      ) : (
        <div className="posts-list">
          {data.map((notification) => {
            const walletAlert = notification.notification_type.includes("wallet") || notification.notification_type.includes("share_reward");
            return (
              <article className="post-admin-card" key={notification.id}>
                <div className="post-admin-card-heading">
                  <div>
                    <span className="role-badge">{walletAlert ? <Wallet size={14} /> : <Bell size={14} />} {notification.read_at ? "خوێندراوەتەوە" : "نوێ"}</span>
                    <h3>{notification.title}</h3>
                  </div>
                  <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString("ckb-IQ", { dateStyle: "medium", timeStyle: "short" })}</time>
                </div>
                <p>{notification.body}</p>
                {notification.notification_type === "store_wallet_empty" && <strong className="form-error">دوکانەکە تا پڕکردنەوەی جزدان و چالاککردنەوەی لەلایەن بەڕێوەبەر ناچالاک دەمێنێتەوە.</strong>}
                {notification.notification_type === "share_reward_shortfall" && <strong className="muted">پاداشتی خەڵات لە کاتی پڕکردنەوەی جزدان دووبارە هەوڵی پارەدان دەدات.</strong>}
                {notification.read_at && <small className="muted"><CheckCircle2 size={14} /> خوێندراوەتەوە</small>}
              </article>
            );
          })}
        </div>
      )}
    </DashboardFrame>
  );
}

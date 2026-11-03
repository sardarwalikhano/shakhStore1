import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  placed: "تۆمارکراوە",
  pending: "چاوەڕێیە",
  confirmed: "پشتڕاستکراوەتەوە",
  accepted: "وەرگیراوەتەوە",
  preparing: "ئامادە دەکرێت",
  ready: "ئامادەیە",
  assigned: "کاپتن دیاریکراوە",
  picked_up: "وەرگیراوە",
  on_the_way: "لە ڕێگادایە",
  delivered: "گەیشتووە",
  cancelled: "هەڵوەشێنراوەتەوە",
};

const paymentLabels: Record<string, string> = {
  pending: "پارە نەدراوە",
  paid: "پارە دراوە",
  failed: "پارەدان سەرکەوتوو نەبوو",
  refunded: "پارە گەڕێندرایەوە",
};

const roleValues = new Set([
  "super_admin", "admin", "restaurant", "supermarket",
  "produce_vendor", "meat_seafood_vendor", "captain", "customer",
]);

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" && roleValues.has(rawRole) ? rawRole as
    | "super_admin" | "admin" | "restaurant" | "supermarket"
    | "produce_vendor" | "meat_seafood_vendor" | "captain" | "customer"
    : null;

  const { data: orders, error } = await supabase.from("orders")
    .select("id, order_number, status, payment_status, total_iqd, currency, created_at")
    .order("created_at", { ascending: false }).limit(50);

  return (
    <DashboardFrame
      identity={{
        name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
        email: user.email ?? null,
        role,
      }}
      title="داواکاریەکان"
      subtitle="داواکارییەکان بە پێی دەسەڵاتی هەژمارەکەت پیشان دەدرێن."
      activePath="/dashboard/orders"
    >
      {error ? (
        <div className="empty-state"><strong>نەتوانرا داواکاریەکان بخوێندرێنەوە</strong><span className="muted">پەیوەندی Supabase و policy ـەکانی RLS پشکنە.</span></div>
      ) : !orders || orders.length === 0 ? (
        <div className="empty-state"><ClipboardList size={32} color="#d96b24" /><strong>هیچ داواکارییەکی تۆمارکراو نییە</strong><span className="muted">کاتێک داواکارییەکی ڕاستەقینە دروست بێت، لێرە دەردەکەوێت.</span></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>ژمارەی داواکاری</th><th>دۆخ</th><th>پارەدان</th><th>کۆی گشتی</th><th>بەروار</th></tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.id}>
                <td dir="ltr">{order.order_number}</td>
                <td><span className="status-pill">{statusLabels[order.status] ?? order.status}</span></td>
                <td>{paymentLabels[order.payment_status] ?? order.payment_status}</td>
                <td>{order.total_iqd.toLocaleString("en-US")} دینار</td>
                <td>{new Date(order.created_at).toLocaleDateString("ckb-IQ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </DashboardFrame>
  );
}

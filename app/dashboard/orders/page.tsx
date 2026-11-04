import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { OrderWorkflowAction } from "@/components/order-workflow-action";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const orderStatusLabels: Record<string, string> = {
  pending_payment: "چاوەڕێی پارەدان",
  placed: "تۆمارکراوە",
  accepted: "پەسەندکراوە",
  preparing: "ئامادە دەکرێت",
  partially_ready: "بەشێک ئامادەیە",
  ready_for_pickup: "ئامادەی وەرگرتنە",
  out_for_delivery: "لە ڕێگای گەیاندندایە",
  delivered: "گەیشتووە",
  cancelled: "هەڵوەشێنراوەتەوە",
  payment_failed: "پارەدان سەرکەوتوو نەبوو",
  refund_requested: "داواکاری گەڕاندنەوەی پارە",
  refunded: "پارە گەڕێندرایەوە",
};

const merchantOrderStatusLabels: Record<string, string> = {
  placed: "داواکاری نوێ",
  accepted: "پەسەندکراوە",
  preparing: "ئامادە دەکرێت",
  ready_for_pickup: "ئامادەی کاپتنە",
  picked_up: "لە کاپتنە",
  delivered: "گەیشتووە",
  cancelled: "هەڵوەشێنراوەتەوە",
};

const paymentLabels: Record<string, string> = {
  pending: "لە چاوەڕوانی پارەدان",
  paid: "پارە دراوە",
  partially_refunded: "بەشێک لە پارە گەڕێندرایەوە",
  failed: "پارەدان سەرکەوتوو نەبوو",
  refunded: "پارە گەڕێندرایەوە",
};

const merchantRoles = new Set([
  "restaurant",
  "supermarket",
  "produce_vendor",
  "meat_seafood_vendor",
]);

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
  const role = typeof rawRole === "string" && roleValues.has(rawRole) ? rawRole : null;

  if (role === "captain") redirect("/dashboard/deliveries");

  const isMerchant = role !== null && merchantRoles.has(role);
  let queryError: string | null = null;
  let customerOrders: Array<{
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    total_iqd: number;
    currency: string;
    created_at: string;
  }> = [];
  let merchantOrders: Array<{
    id: string;
    order_id: string;
    store_name_snapshot: string;
    status: string;
    items_subtotal_iqd: number;
    created_at: string;
  }> = [];
  let orderNumbers = new Map<string, string>();

  if (isMerchant) {
    const { data, error } = await supabase
      .from("order_stores")
      .select("id, order_id, store_name_snapshot, status, items_subtotal_iqd, created_at")
      .eq("merchant_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      queryError = error.message;
    } else {
      merchantOrders = data ?? [];
      const orderIds = [...new Set(merchantOrders.map((item) => item.order_id))];

      if (orderIds.length > 0) {
        const { data: headers, error: headersError } = await supabase
          .from("orders")
          .select("id, order_number")
          .in("id", orderIds);

        if (headersError) queryError = headersError.message;
        else orderNumbers = new Map((headers ?? []).map((item) => [item.id, item.order_number]));
      }
    }
  } else {
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total_iqd, currency, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) queryError = error.message;
    else customerOrders = data ?? [];
  }

  return (
    <DashboardFrame
      identity={{
        name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
        email: user.email ?? null,
        role: role as "super_admin" | "admin" | "restaurant" | "supermarket" | "produce_vendor" | "meat_seafood_vendor" | "captain" | "customer" | null,
      }}
      title="داواکاریەکان"
      subtitle={isMerchant
        ? "داواکارییەکانی فرۆشگاکەت بە پێی مۆڵەتی خۆت پیشان دەدرێن."
        : "داواکارییەکان بە پێی دەسەڵاتی هەژمارەکەت پیشان دەدرێن."}
      activePath="/dashboard/orders"
    >
      {queryError ? (
        <div className="empty-state"><strong>نەتوانرا داواکاریەکان بخوێندرێنەوە</strong><span className="muted">پەیوەندی Supabase و policy ـەکانی RLS پشکنە.</span></div>
      ) : isMerchant ? (
        merchantOrders.length === 0 ? (
          <div className="empty-state"><ClipboardList size={32} color="#d96b24" /><strong>هیچ داواکارییەکی نوێ نییە</strong><span className="muted">کاتێک کڕیار لە فرۆشگاکەت داواکاری تۆمار بکات، لێرە دەردەکەوێت.</span></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>ژمارەی داواکاری</th><th>فرۆشگا</th><th>دۆخی فرۆشگا</th><th>کۆی کاڵاکان</th><th>بەروار</th><th>کردار</th></tr></thead>
              <tbody>{merchantOrders.map((order) => (
                <tr key={order.id}>
                  <td dir="ltr">{orderNumbers.get(order.order_id) ?? "—"}</td>
                  <td>{order.store_name_snapshot}</td>
                  <td><span className="status-pill">{merchantOrderStatusLabels[order.status] ?? order.status}</span></td>
                  <td>{order.items_subtotal_iqd.toLocaleString("en-US")} دینار</td>
                  <td>{new Date(order.created_at).toLocaleDateString("ckb-IQ")}</td>
                  <td><OrderWorkflowAction scope="merchant" recordId={order.id} status={order.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      ) : (
        customerOrders.length === 0 ? (
          <div className="empty-state"><ClipboardList size={32} color="#d96b24" /><strong>هیچ داواکارییەکی تۆمارکراو نییە</strong><span className="muted">کاتێک داواکارییەکی ڕاستەقینە دروست بێت، لێرە دەردەکەوێت.</span></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>ژمارەی داواکاری</th><th>دۆخ</th><th>پارەدان</th><th>کۆی گشتی</th><th>بەروار</th></tr></thead>
              <tbody>{customerOrders.map((order) => (
                <tr key={order.id}>
                  <td dir="ltr">{order.order_number}</td>
                  <td><span className="status-pill">{orderStatusLabels[order.status] ?? order.status}</span></td>
                  <td>{paymentLabels[order.payment_status] ?? order.payment_status}</td>
                  <td>{order.total_iqd.toLocaleString("en-US")} {order.currency === "IQD" ? "دینار" : order.currency}</td>
                  <td>{new Date(order.created_at).toLocaleDateString("ckb-IQ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}
    </DashboardFrame>
  );
}

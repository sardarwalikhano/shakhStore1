import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { OrderWorkflowAction } from "@/components/order-workflow-action";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const orderStatusLabels: Record<string, string> = {
  pending_payment: "چاوەڕێی پارەدان", placed: "تۆمارکراوە", accepted: "پەسەندکراوە",
  preparing: "ئامادە دەکرێت", partially_ready: "بەشێک ئامادەیە",
  ready_for_pickup: "ئامادەی وەرگرتنە", out_for_delivery: "لە ڕێگای گەیاندندایە",
  delivered: "گەیشتووە", cancelled: "هەڵوەشێنراوەتەوە",
  payment_failed: "پارەدان سەرکەوتوو نەبوو", refund_requested: "داواکاری گەڕاندنەوەی پارە",
  refunded: "پارە گەڕێندرایەوە",
};
const merchantStatusLabels: Record<string, string> = {
  placed: "داواکاری نوێ", accepted: "پەسەندکراوە", preparing: "ئامادە دەکرێت",
  ready_for_pickup: "ئامادەی کاپتنە", picked_up: "لە کاپتنە",
  delivered: "گەیشتووە", cancelled: "هەڵوەشێنراوەتەوە",
};
const paymentLabels: Record<string, string> = {
  pending: "لە چاوەڕوانی پارەدان", paid: "پارە دراوە",
  partially_refunded: "بەشێک لە پارە گەڕێندرایەوە",
  failed: "پارەدان سەرکەوتوو نەبوو", refunded: "پارە گەڕێندرایەوە",
};
const merchantRoles = new Set(["restaurant", "supermarket", "produce_vendor", "meat_seafood_vendor"]);
const roles = new Set(["super_admin", "admin", "restaurant", "supermarket", "produce_vendor", "meat_seafood_vendor", "captain", "customer"]);

type Props = { searchParams: Promise<{ status?: string; q?: string }> };
export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const requestedQuery = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" && roles.has(rawRole) ? rawRole : null;
  if (role === "captain") redirect("/dashboard/deliveries");
  const isAdmin = role === "admin" || role === "super_admin";
  const isMerchant = role !== null && merchantRoles.has(role);
  const statusOptions = isMerchant ? merchantStatusLabels : orderStatusLabels;
  const statusFilter = Object.hasOwn(statusOptions, requestedStatus) ? requestedStatus : "";

  let queryError: string | null = null;
  let customerOrders: Array<{
    id: string; order_number: string; status: string; payment_status: string;
    total_iqd: number; currency: string; created_at: string;
  }> = [];
  let merchantOrders: Array<{
    id: string; order_id: string; store_name_snapshot: string; status: string;
    items_subtotal_iqd: number; created_at: string;
  }> = [];
  let orderNumbers = new Map<string, string>();

  if (isMerchant) {
    let query = supabase.from("order_stores")
      .select("id,order_id,store_name_snapshot,status,items_subtotal_iqd,created_at")
      .eq("merchant_user_id", user.id)
      .order("created_at", { ascending: false }).limit(100);
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) queryError = error.message;
    else {
      merchantOrders = data ?? [];
      const ids = [...new Set(merchantOrders.map((item) => item.order_id))];
      if (ids.length) {
        const { data: headers, error: headerError } = await supabase.from("orders")
          .select("id,order_number").in("id", ids);
        if (headerError) queryError = headerError.message;
        else orderNumbers = new Map((headers ?? []).map((item) => [item.id, item.order_number]));
      }
    }
  } else {
    let query = supabase.from("orders")
      .select("id,order_number,status,payment_status,total_iqd,currency,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (requestedQuery) query = query.ilike("order_number", `%${requestedQuery}%`);
    const { data, error } = await query;
    if (error) queryError = error.message;
    else customerOrders = data ?? [];
  }

  const name = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر";
  const counts = {
    total: customerOrders.length,
    active: customerOrders.filter((o) => ["placed","accepted","preparing","partially_ready","ready_for_pickup","out_for_delivery"].includes(o.status)).length,
    delivered: customerOrders.filter((o) => o.status === "delivered").length,
    cancelled: customerOrders.filter((o) => ["cancelled","payment_failed"].includes(o.status)).length,
  };

  return (
    <DashboardFrame
      identity={{ name, email: user.email ?? null, role: role as "super_admin" | "admin" | "restaurant" | "supermarket" | "produce_vendor" | "meat_seafood_vendor" | "captain" | "customer" | null }}
      title={isAdmin ? "بەڕێوەبردنی ئۆردەرەکان" : "داواکاریەکان"}
      subtitle={isAdmin ? "چاودێری ئۆردەر، دۆخی پارەدان و بەدواداچوونی داواکارییەکان." : isMerchant ? "تەنها داواکارییەکانی فرۆشگاکەت." : "داواکارییەکان و شوێنکەوتنی گەیاندنەکانت."}
      activePath="/dashboard/orders"
    >
      {isAdmin && (
        <section className="dashboard-metrics" aria-label="پوختەی ئۆردەر">
          <article><span>کۆی پیشاندراو</span><strong>{counts.total}</strong></article>
          <article><span>لە پرۆسەدایە</span><strong>{counts.active}</strong></article>
          <article><span>گەیەنراوە</span><strong>{counts.delivered}</strong></article>
          <article><span>هەڵوەشاوە / شکستی پارەدان</span><strong>{counts.cancelled}</strong></article>
        </section>
      )}

      {!queryError && (
        <form action="/dashboard/orders" method="get" className="dashboard-filter-bar">
          <label><span>دۆخی ئۆردەر</span>
            <select name="status" defaultValue={statusFilter}>
              <option value="">هەموو دۆخەکان</option>
              {Object.entries(statusOptions).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          {!isMerchant && <label><span>ژمارەی ئۆردەر</span>
            <input name="q" type="search" maxLength={80} defaultValue={requestedQuery} placeholder="ژمارەی ئۆردەر..." />
          </label>}
          <button className="button" type="submit"><Search size={16} /> فلتەرکردن</button>
          {(statusFilter || requestedQuery) && <Link className="text-link" href="/dashboard/orders">پاککردنەوە</Link>}
        </form>
      )}

      {queryError ? (
        <div className="empty-state"><strong>نەتوانرا داواکاریەکان بخوێندرێنەوە</strong><span className="muted">پەیوەندی Supabase و policy ـەکانی RLS پشکنە.</span></div>
      ) : isMerchant ? (
        merchantOrders.length === 0 ? (
          <div className="empty-state"><ClipboardList size={32} /><strong>هیچ داواکارییەک بۆ ئەم فلتەرە نییە</strong></div>
        ) : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>ژمارەی ئۆردەر</th><th>فرۆشگا</th><th>دۆخ</th><th>کۆی کاڵاکان</th><th>بەروار</th><th>کردار</th></tr></thead>
            <tbody>{merchantOrders.map((order) => <tr key={order.id}>
              <td dir="ltr">{orderNumbers.get(order.order_id) ?? "—"}</td>
              <td>{order.store_name_snapshot}</td>
              <td><span className="status-pill">{merchantStatusLabels[order.status] ?? order.status}</span></td>
              <td>{order.items_subtotal_iqd.toLocaleString("en-US")} دینار</td>
              <td>{new Date(order.created_at).toLocaleDateString("ckb-IQ")}</td>
              <td><OrderWorkflowAction scope="merchant" recordId={order.id} status={order.status} /></td>
            </tr>)}</tbody>
          </table></div>
        )
      ) : customerOrders.length === 0 ? (
        <div className="empty-state"><ClipboardList size={32} /><strong>هیچ داواکارییەک بۆ ئەم فلتەرە نییە</strong></div>
      ) : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>ژمارەی ئۆردەر</th><th>دۆخ</th><th>پارەدان</th><th>کۆی گشتی</th><th>بەروار</th><th>وردەکاری</th></tr></thead>
          <tbody>{customerOrders.map((order) => <tr key={order.id}>
            <td dir="ltr">{order.order_number}</td>
            <td><span className="status-pill">{orderStatusLabels[order.status] ?? order.status}</span></td>
            <td>{paymentLabels[order.payment_status] ?? order.payment_status}</td>
            <td>{order.total_iqd.toLocaleString("en-US")} {order.currency === "IQD" ? "دینار" : order.currency}</td>
            <td>{new Date(order.created_at).toLocaleDateString("ckb-IQ")}</td>
            <td><Link href={`/dashboard/orders/${order.id}`} className="text-link">وردەکاری و بەدواداچوون</Link></td>
          </tr>)}</tbody>
        </table></div>
      )}
      {isAdmin && <p className="muted dashboard-list-note">لیستەکە سنووری ١٠٠ داواکاری دواخراوی هەیە؛ بۆ وردتر فلتەر بەکاربهێنە.</p>}
    </DashboardFrame>
  );
}

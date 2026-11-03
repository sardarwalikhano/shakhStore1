import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardList } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statusLabels: Record<string,string> = {
  pending: "چاوەڕێیە",
  confirmed: "پشتڕاستکراوەتەوە",
  preparing: "ئامادە دەکرێت",
  ready: "ئامادەیە",
  assigned: "کاپتن دیاریکراوە",
  picked_up: "وەرگیراوە",
  on_the_way: "لە ڕێگادایە",
  delivered: "گەیشتووە",
  cancelled: "هەڵوەشێنراوەتەوە",
};

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orders, error } = await supabase.from("orders")
    .select("id, order_number, status, payment_status, total_iqd, currency, created_at")
    .order("created_at", { ascending: false }).limit(50);

  return (
    <main className="container section">
      <Link href="/dashboard" className="text-link"><ArrowRight size={17} /> گەڕانەوە بۆ داشبۆرد</Link>
      <div className="section-heading" style={{ marginTop: 22 }}>
        <div><h1>داواکاریەکان</h1><p>تەنها ئەو داواکارییانە دەبینیت کە RLS ڕێگەی پێدەدات.</p></div>
      </div>
      {error ? (
        <div className="empty-state"><strong>نەتوانرا داواکاریەکان بخوێندرێنەوە</strong><span className="muted">دەستڕاگەیشتنی Supabase یان policy ـەکان پشکنە.</span></div>
      ) : !orders || orders.length === 0 ? (
        <div className="empty-state"><ClipboardList size={30} color="#f36b18" /><strong>هیچ داواکارییەکی تۆمارکراو نییە</strong><span className="muted">کاتێک داواکارییەکی ڕاستەقینە دروست بێت، لێرە دەردەکەوێت.</span></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>ژمارەی داواکاری</th><th>دۆخ</th><th>پارەدان</th><th>کۆی گشتی</th><th>بەروار</th></tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.id}>
                <td dir="ltr">{order.order_number}</td>
                <td><span className="status-pill">{statusLabels[order.status] ?? order.status}</span></td>
                <td>{order.payment_status}</td>
                <td>{order.total_iqd.toLocaleString("en-US")} دینار</td>
                <td>{new Date(order.created_at).toLocaleDateString("ckb-IQ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
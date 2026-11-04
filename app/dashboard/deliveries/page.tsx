import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPinned, Search, Truck } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { OrderWorkflowAction } from "@/components/order-workflow-action";
import { DeliveryAssignmentAction, type CaptainOption } from "@/components/delivery-assignment-action";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCaptainEligibleForZone } from "@/lib/captain-scope";

const deliveryStatusLabels: Record<string, string> = {
  awaiting_captain: "چاوەڕێی کاپتن", assigned: "کاپتن دیاریکراوە",
  accepted: "لە لایەن کاپتن پەسەندکراوە", picked_up: "لە فرۆشگا وەرگیراوە",
  on_the_way: "لە ڕێگادایە", delivered: "گەیشتووە", cancelled: "هەڵوەشێنراوەتەوە",
};
const roleValues = new Set(["super_admin", "admin", "captain"]);
const allowedStatuses = new Set(Object.keys(deliveryStatusLabels));
type AddressSnapshot = Record<string, unknown>;
type Props = { searchParams: Promise<{ status?: string; q?: string }> };

function readSnapshot(value: unknown): AddressSnapshot {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as AddressSnapshot : {};
}
function textValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString("ckb-IQ", { dateStyle: "medium", timeStyle: "short" }) : "هێشتا تۆمار نەکراوە";
}

export const dynamic = "force-dynamic";

export default async function DeliveriesPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const requestedQuery = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" && roleValues.has(rawRole) ? rawRole : null;
  if (role !== "captain" && role !== "admin" && role !== "super_admin") redirect("/dashboard");
  const isAdmin = role === "admin" || role === "super_admin";
  const statusFilter = allowedStatuses.has(requestedStatus) ? requestedStatus : "";

  let queryError: string | null = null;
  let availableCaptains: CaptainOption[] = [];
  if (isAdmin) {
    const { data, error } = await supabase.rpc("admin_list_captain_scopes_v1");
    if (error) queryError = error.message;
    else availableCaptains = data ?? [];
  }

  let assignmentQuery = supabase.from("delivery_assignments")
    .select("id,order_id,order_store_id,captain_user_id,status,assigned_at,accepted_at,picked_up_at,delivered_at,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (role === "captain") assignmentQuery = assignmentQuery.eq("captain_user_id", user.id);
  if (statusFilter) assignmentQuery = assignmentQuery.eq("status", statusFilter);
  const { data: assignments, error: assignmentError } = await assignmentQuery;
  if (assignmentError) queryError = assignmentError.message;

  const rows = assignments ?? [];
  const orderIds = [...new Set(rows.map((item) => item.order_id))];
  const storeIds = [...new Set(rows.map((item) => item.order_store_id))];
  let orderMap = new Map<string, { order_number: string; address_snapshot: unknown; total_iqd: number; currency: string; delivery_zone_id: string }>();
  let storeMap = new Map<string, { name: string; status: string }>();

  if (!queryError && orderIds.length) {
    const { data, error } = await supabase.from("orders")
      .select("id,order_number,address_snapshot,total_iqd,currency,delivery_zone_id").in("id", orderIds);
    if (error) queryError = error.message;
    else orderMap = new Map((data ?? []).map((item) => [item.id, {
      order_number: item.order_number, address_snapshot: item.address_snapshot,
      total_iqd: item.total_iqd, currency: item.currency, delivery_zone_id: item.delivery_zone_id,
    }]));
  }
  if (!queryError && storeIds.length) {
    const { data, error } = await supabase.from("order_stores")
      .select("id,store_name_snapshot,status").in("id", storeIds);
    if (error) queryError = error.message;
    else storeMap = new Map((data ?? []).map((item) => [item.id, { name: item.store_name_snapshot, status: item.status }]));
  }

  const captainNames = new Map(availableCaptains.map((item) => [item.user_id, item.full_name]));
  const filtered = requestedQuery
    ? rows.filter((item) => orderMap.get(item.order_id)?.order_number.toLowerCase().includes(requestedQuery.toLowerCase()))
    : rows;
  const counts = {
    total: filtered.length,
    awaiting: filtered.filter((item) => item.status === "awaiting_captain").length,
    active: filtered.filter((item) => ["assigned","accepted","picked_up","on_the_way"].includes(item.status)).length,
    delivered: filtered.filter((item) => item.status === "delivered").length,
  };
  const displayName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر";

  return (
    <DashboardFrame
      identity={{ name: displayName, email: user.email ?? null, role: role as "super_admin" | "admin" | "captain" | null }}
      title={isAdmin ? "چاودێری گەیاندن" : "گەیاندنەکانی من"}
      subtitle={isAdmin ? "چاودێری هەموو گەیاندنەکان، دیاریکردنی کاپتن و بەدواداچوونی کاتی." : "تەنها ئەو گەیاندنانە دەبینیت کە بە ناوی تۆوە تۆمار کراون."}
      activePath="/dashboard/deliveries"
    >
      <section className="dashboard-metrics" aria-label="پوختەی گەیاندن">
        <article><span>کۆی گەیاندنەکان</span><strong>{counts.total}</strong></article>
        <article><span>چاوەڕێی کاپتن</span><strong>{counts.awaiting}</strong></article>
        <article><span>لە ڕێگادایە</span><strong>{counts.active}</strong></article>
        <article><span>گەیەنراوە</span><strong>{counts.delivered}</strong></article>
      </section>

      <form action="/dashboard/deliveries" method="get" className="dashboard-filter-bar">
        {isAdmin && <label><span>دۆخی گەیاندن</span>
          <select name="status" defaultValue={statusFilter}>
            <option value="">هەموو دۆخەکان</option>
            {Object.entries(deliveryStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>}
        <label><span>ژمارەی ئۆردەر</span><input name="q" type="search" maxLength={80} defaultValue={requestedQuery} placeholder="ژمارەی ئۆردەر..." /></label>
        <button className="button" type="submit"><Search size={16} /> فلتەرکردن</button>
        {(statusFilter || requestedQuery) && <Link className="text-link" href="/dashboard/deliveries">پاککردنەوە</Link>}
      </form>

      {queryError ? (
        <div className="empty-state"><strong>نەتوانرا لیستی گەیاندنەکان بخوێندرێتەوە</strong><span className="muted">پەیوەندی Supabase و RLS پشکنە.</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><Truck size={34} /><strong>هیچ گەیاندنێک بۆ ئەم فلتەرە نییە</strong><span className="muted">فلتەرەکە پاک بکەرەوە یان چاوەڕێی گەیاندنی نوێ بکە.</span></div>
      ) : (
        <div className="dashboard-content">
          {filtered.map((assignment) => {
            const order = orderMap.get(assignment.order_id);
            const address = readSnapshot(order?.address_snapshot);
            const addressLine = [textValue(address.address_line),textValue(address.district),textValue(address.city)].filter(Boolean).join("، ");
            const recipient = textValue(address.recipient_name);
            const phone = textValue(address.phone);
            const notes = textValue(address.delivery_notes);
            const eligibleCaptains = availableCaptains.filter((captain) =>
              isCaptainEligibleForZone(captain, order?.delivery_zone_id ?? null),
            );
            return (
              <article className="dashboard-panel" key={assignment.id}>
                <div className="dashboard-topbar">
                  <div>
                    <span className="status-pill">{deliveryStatusLabels[assignment.status] ?? assignment.status}</span>
                    {role === "captain" && <OrderWorkflowAction scope="captain" recordId={assignment.id} status={assignment.status} />}
                    <h3 dir="ltr">{order?.order_number ?? "—"}</h3>
                    <p className="muted">{storeMap.get(assignment.order_store_id)?.name ?? "فرۆشگا"}</p>
                    {isAdmin && assignment.captain_user_id && <p className="muted">کاپتن: {captainNames.get(assignment.captain_user_id) ?? "کاپتن دیاریکراوە"}</p>}
                    {isAdmin && <DeliveryAssignmentAction assignmentId={assignment.id} assignmentStatus={assignment.status} storeStatus={storeMap.get(assignment.order_store_id)?.status} captains={eligibleCaptains} />}
                  </div>
                  <strong>{order ? `${order.total_iqd.toLocaleString("en-US")} دینار` : "—"}</strong>
                </div>
                <div className="dashboard-account-panel"><div>
                  <strong>{recipient || "ناوی کڕیار تۆمار نەکراوە"}</strong>
                  {phone ? <p><a href={`tel:${phone}`} dir="ltr">{phone}</a></p> : <p className="muted">ژمارەی تەلەفۆن نییە</p>}
                  <p><MapPinned size={15} /> {addressLine || "ناونیشانی ورد تۆمار نەکراوە"}</p>
                  {notes && <p className="muted">تێبینی: {notes}</p>}
                </div></div>
                <div className="dashboard-quick-links">
                  <span>دیاریکراو: {formatTimestamp(assignment.assigned_at)}</span>
                  <span>پەسەندکراو: {formatTimestamp(assignment.accepted_at)}</span>
                  <span>وەرگیراو: {formatTimestamp(assignment.picked_up_at)}</span>
                  <span>گەیشتوو: {formatTimestamp(assignment.delivered_at)}</span>
                  <Link href={`/dashboard/orders/${assignment.order_id}`} className="text-link">وردەکاری ئۆردەر <Search size={14} /></Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {isAdmin && <p className="muted dashboard-list-note">لیستەکە سنووری ١٠٠ گەیاندنی دواخراوی هەیە؛ بۆ وردتر فلتەر بەکاربهێنە.</p>}
    </DashboardFrame>
  );
}

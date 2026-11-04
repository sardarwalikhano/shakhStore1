import { redirect } from "next/navigation";
import { MapPinned, Truck } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { OrderWorkflowAction } from "@/components/order-workflow-action";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const deliveryStatusLabels: Record<string, string> = {
  awaiting_captain: "چاوەڕێی کاپتن",
  assigned: "کاپتن دیاریکراوە",
  accepted: "لە لایەن کاپتن پەسەندکراوە",
  picked_up: "لە فرۆشگا وەرگیراوە",
  on_the_way: "لە ڕێگادایە",
  delivered: "گەیشتووە",
  cancelled: "هەڵوەشێنراوەتەوە",
};

const roleValues = new Set(["super_admin", "admin", "captain"]);

type AddressSnapshot = Record<string, unknown>;

function readSnapshot(value: unknown): AddressSnapshot {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as AddressSnapshot;
  }
  return {};
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "هێشتا تۆمار نەکراوە";
  return new Date(value).toLocaleString("ckb-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" && roleValues.has(rawRole) ? rawRole : null;
  if (role !== "captain" && role !== "admin" && role !== "super_admin") {
    redirect("/dashboard");
  }

  let queryError: string | null = null;
  const assignmentQuery = supabase
    .from("delivery_assignments")
    .select("id, order_id, order_store_id, status, assigned_at, accepted_at, picked_up_at, delivered_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (role === "captain") assignmentQuery.eq("captain_user_id", user.id);

  const { data: assignments, error: assignmentsError } = await assignmentQuery;
  if (assignmentsError) queryError = assignmentsError.message;

  const orderIds = [...new Set((assignments ?? []).map((item) => item.order_id))];
  const orderStoreIds = [...new Set((assignments ?? []).map((item) => item.order_store_id))];

  let orderMap = new Map<string, {
    order_number: string;
    address_snapshot: unknown;
    total_iqd: number;
    currency: string;
  }>();
  let storeMap = new Map<string, string>();

  if (!queryError && orderIds.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, address_snapshot, total_iqd, currency")
      .in("id", orderIds);

    if (ordersError) queryError = ordersError.message;
    else {
      orderMap = new Map((orders ?? []).map((order) => [order.id, {
        order_number: order.order_number,
        address_snapshot: order.address_snapshot,
        total_iqd: order.total_iqd,
        currency: order.currency,
      }]));
    }
  }

  if (!queryError && orderStoreIds.length > 0) {
    const { data: stores, error: storesError } = await supabase
      .from("order_stores")
      .select("id, store_name_snapshot")
      .in("id", orderStoreIds);

    if (storesError) queryError = storesError.message;
    else storeMap = new Map((stores ?? []).map((store) => [store.id, store.store_name_snapshot]));
  }

  const name = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : user.email ?? "بەکارهێنەر";

  return (
    <DashboardFrame
      identity={{
        name,
        email: user.email ?? null,
        role: role as "super_admin" | "admin" | "captain" | null,
      }}
      title="ڕێڕەوی گەیاندن"
      subtitle={role === "captain"
        ? "تەنها ئەو گەیاندنانە دەبینیت کە بە ناوی تۆوە تۆمار کراون."
        : "چاودێری دۆخی گەیاندنەکان لە هەموو فرۆشگاکان."}
      activePath="/dashboard/deliveries"
    >
      {queryError ? (
        <div className="empty-state"><strong>نەتوانرا لیستی گەیاندنەکان بخوێندرێتەوە</strong><span className="muted">پەیوەندی Supabase و RLS پشکنە.</span></div>
      ) : !assignments || assignments.length === 0 ? (
        <div className="empty-state"><Truck size={34} color="#d96b24" /><strong>هیچ گەیاندنێک بۆ پیشاندان نییە</strong><span className="muted">کاتێک گەیاندنێک بۆ کاپتن دیاری بکرێت، لێرە دەردەکەوێت.</span></div>
      ) : (
        <div className="dashboard-content">
          {assignments.map((assignment) => {
            const order = orderMap.get(assignment.order_id);
            const address = readSnapshot(order?.address_snapshot);
            const addressLine = [
              textValue(address.address_line),
              textValue(address.district),
              textValue(address.city),
            ].filter(Boolean).join("، ");
            const recipient = textValue(address.recipient_name);
            const phone = textValue(address.phone);
            const notes = textValue(address.delivery_notes);

            return (
              <article className="dashboard-panel" key={assignment.id}>
                <div className="dashboard-topbar">
                  <div>
                    <span className="status-pill">{deliveryStatusLabels[assignment.status] ?? assignment.status}</span>
                    {role === "captain" && <OrderWorkflowAction scope="captain" recordId={assignment.id} status={assignment.status} />}
                    <h3 dir="ltr">{order?.order_number ?? "—"}</h3>
                    <p className="muted">{storeMap.get(assignment.order_store_id) ?? "فرۆشگا"}</p>
                  </div>
                  <strong>{order ? `${order.total_iqd.toLocaleString("en-US")} دینار` : "—"}</strong>
                </div>
                <div className="dashboard-account-panel">
                  <div>
                    <strong>{recipient || "ناوی کڕیار تۆمار نەکراوە"}</strong>
                    {phone ? <p><a href={`tel:${phone}`} dir="ltr">{phone}</a></p> : <p className="muted">ژمارەی تەلەفۆن نییە</p>}
                    <p><MapPinned size={15} /> {addressLine || "ناونیشانی ورد تۆمار نەکراوە"}</p>
                    {notes && <p className="muted">تێبینی: {notes}</p>}
                  </div>
                </div>
                <div className="dashboard-quick-links">
                  <span>دیاریکراو: {formatTimestamp(assignment.assigned_at)}</span>
                  <span>پەسەندکراو: {formatTimestamp(assignment.accepted_at)}</span>
                  <span>وەرگیراو: {formatTimestamp(assignment.picked_up_at)}</span>
                  <span>گەیشتوو: {formatTimestamp(assignment.delivered_at)}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DashboardFrame>
  );
}

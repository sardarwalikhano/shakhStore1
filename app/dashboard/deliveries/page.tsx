import { redirect } from "next/navigation";
import { MapPinned, Truck } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { OrderWorkflowAction } from "@/components/order-workflow-action";
import { CodCollectionAction } from "@/components/cod-collection-action";
import { getCodDeliveryFeeShare } from "@/lib/cod-allocation";
import { DeliveryAssignmentAction, type CaptainOption } from "@/components/delivery-assignment-action";
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
  let availableCaptains: CaptainOption[] = [];

  if (role === "admin" || role === "super_admin") {
    const { data, error } = await supabase.rpc("admin_list_available_captains_v1");
    if (error) queryError = error.message;
    else availableCaptains = data ?? [];
  }
  const assignmentQuery = supabase
    .from("delivery_assignments")
    .select("id, order_id, order_store_id, status, assigned_at, accepted_at, picked_up_at, delivered_at, created_at, cod_collected_at, cod_collected_iqd")
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
    items_subtotal_iqd: number;
    delivery_fee_iqd: number;
    payment_method: string;
    payment_status: string;
    currency: string;
  }>();
  let storeMap = new Map<string, { name: string; status: string; order_id: string; items_subtotal_iqd: number; created_at: string }>();

  if (!queryError && orderIds.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, address_snapshot, total_iqd, items_subtotal_iqd, delivery_fee_iqd, payment_method, payment_status, currency")
      .in("id", orderIds);

    if (ordersError) queryError = ordersError.message;
    else {
      orderMap = new Map((orders ?? []).map((order) => [order.id, {
        order_number: order.order_number,
        address_snapshot: order.address_snapshot,
        total_iqd: order.total_iqd,
        items_subtotal_iqd: order.items_subtotal_iqd,
        delivery_fee_iqd: order.delivery_fee_iqd,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        currency: order.currency,
      }]));
    }
  }

  if (!queryError && orderStoreIds.length > 0) {
    const { data: stores, error: storesError } = await supabase
      .from("order_stores")
      .select("id, order_id, store_name_snapshot, status, items_subtotal_iqd, created_at")
      .in("id", orderStoreIds);

    if (storesError) queryError = storesError.message;
    else storeMap = new Map((stores ?? []).map((store) => [store.id, { name: store.store_name_snapshot, status: store.status, order_id: store.order_id, items_subtotal_iqd: store.items_subtotal_iqd, created_at: store.created_at }]));
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
            const orderConsignments = [...storeMap.entries()]
              .filter(([, store]) => store.order_id === assignment.order_id)
              .map(([id, store]) => ({
                id,
                createdAt: store.created_at,
                itemsSubtotalIqd: store.items_subtotal_iqd,
              }));
            const deliveryFeeShare = order
              ? getCodDeliveryFeeShare(
                  order.delivery_fee_iqd,
                  order.items_subtotal_iqd,
                  orderConsignments,
                  assignment.order_store_id,
                ) ?? 0
              : 0;
            const expectedCodCash = (storeMap.get(assignment.order_store_id)?.items_subtotal_iqd ?? 0) + deliveryFeeShare;

            return (
              <article className="dashboard-panel" key={assignment.id}>
                <div className="dashboard-topbar">
                  <div>
                    <span className="status-pill">{deliveryStatusLabels[assignment.status] ?? assignment.status}</span>
                    {role === "captain" && <OrderWorkflowAction scope="captain" recordId={assignment.id} status={assignment.status} />}
                    <h3 dir="ltr">{order?.order_number ?? "—"}</h3>
                    <p className="muted">{storeMap.get(assignment.order_store_id)?.name ?? "فرۆشگا"}</p>
                    {(role === "admin" || role === "super_admin") && (
                      <DeliveryAssignmentAction
                        assignmentId={assignment.id}
                        assignmentStatus={assignment.status}
                        storeStatus={storeMap.get(assignment.order_store_id)?.status}
                        captains={availableCaptains}
                      />
                    )}
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
                {role === "captain" && order?.payment_method === "cash_on_delivery" && assignment.status === "delivered" && (
                  <CodCollectionAction
                    assignmentId={assignment.id}
                    expectedCashIqd={expectedCodCash}
                    collectedAt={assignment.cod_collected_at}
                    collectedAmountIqd={assignment.cod_collected_iqd}
                  />
                )}
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

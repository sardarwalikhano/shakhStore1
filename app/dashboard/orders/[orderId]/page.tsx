import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, ClipboardList, MapPin, PackageCheck, Truck } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActorLabel,
  getAddressLine,
  getDeliveryStatusLabel,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getSafeSnapshotText,
  getStoreStatusLabel,
} from "@/lib/order-tracking";

type Props = {
  params: Promise<{ orderId: string }>;
};

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "هێشتا تۆمار نەکراوە";
  return new Date(value).toLocaleString("ckb-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMoney(value: number) {
  return `${value.toLocaleString("en-US")} دینار`;
}

export default async function CustomerOrderTrackingPage({ params }: Props) {
  const { orderId } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" ? rawRole : null;
  if (role !== "customer" && role !== "admin" && role !== "super_admin") {
    redirect("/dashboard");
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status, payment_method, currency, items_subtotal_iqd, delivery_fee_iqd, discount_iqd, tax_iqd, total_iqd, address_snapshot, customer_note, placed_at, delivered_at, created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) notFound();

  const [storeResult, eventResult, deliveryResult] = await Promise.all([
    supabase
      .from("order_stores")
      .select("id, store_name_snapshot, status, items_subtotal_iqd, created_at, updated_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_status_events")
      .select("id, order_store_id, actor_role, previous_status, new_status, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("delivery_assignments")
      .select("id, order_store_id, status, assigned_at, accepted_at, picked_up_at, delivered_at, created_at, updated_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
  ]);

  const queryError = storeResult.error || eventResult.error || deliveryResult.error;
  const stores = storeResult.data ?? [];
  const events = eventResult.data ?? [];
  const deliveries = deliveryResult.data ?? [];
  const storeNames = new Map(stores.map((store) => [store.id, store.store_name_snapshot]));
  const addressLine = getAddressLine(order.address_snapshot);
  const address = order.address_snapshot && typeof order.address_snapshot === "object" && !Array.isArray(order.address_snapshot)
    ? order.address_snapshot as Record<string, unknown>
    : {};
  const recipient = getSafeSnapshotText(address.recipient_name);
  const phone = getSafeSnapshotText(address.phone);
  const paymentMethod = order.payment_method === "cash_on_delivery"
    ? "پارەدان لە کاتی گەیاندن"
    : order.payment_method === "shakh_wallet"
      ? "جزدانی شاخ"
      : order.payment_method;

  return (
    <DashboardFrame
      identity={{
        name: typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : user.email ?? "بەکارهێنەر",
        email: user.email ?? null,
        role: role as "admin" | "super_admin" | "customer",
      }}
      title="بەدواداچوونی داواکاری"
      subtitle={`ژمارەی داواکاری: ${order.order_number}`}
      activePath="/dashboard/orders"
    >
      <div className="order-tracking-page">
        <Link href="/dashboard/orders" className="auth-back"><ArrowRight size={17} /> گەڕانەوە بۆ داواکاریەکان</Link>

        <section className="dashboard-panel tracking-summary">
          <div className="tracking-summary-top">
            <div>
              <span className="muted">دۆخی ئێستای داواکاری</span>
              <h2>{getOrderStatusLabel(order.status)}</h2>
              <p className="muted">تۆمارکراوە: {formatDate(order.placed_at || order.created_at)}</p>
            </div>
            <span className="status-pill">{getPaymentStatusLabel(order.payment_status)}</span>
          </div>
          <div className="tracking-total">
            <span>کۆی گشتی</span>
            <strong>{formatMoney(order.total_iqd)}</strong>
          </div>
        </section>

        {queryError ? (
          <div className="empty-state">
            <strong>نەتوانرا وردەکارییەکانی داواکاری تەواو بخوێندرێنەوە</strong>
            <span className="muted">تکایە دووبارە هەوڵ بدەرەوە؛ زانیارییەکانی داواکاری پارێزراون.</span>
          </div>
        ) : (
          <>
            <section className="dashboard-panel">
              <h3><PackageCheck size={19} /> دۆخی فرۆشگاکان</h3>
              {stores.length === 0 ? (
                <p className="muted">وردەکاری فرۆشگا بەردەست نییە.</p>
              ) : (
                <div className="tracking-store-list">
                  {stores.map((store) => {
                    const delivery = deliveries.find((item) => item.order_store_id === store.id);
                    return (
                      <article className="tracking-store" key={store.id}>
                        <div>
                          <strong>{store.store_name_snapshot}</strong>
                          <p className="muted">{formatMoney(store.items_subtotal_iqd)}</p>
                        </div>
                        <div className="tracking-store-status">
                          <span className="status-pill">{getStoreStatusLabel(store.status)}</span>
                          {delivery ? (
                            <span className="muted"><Truck size={15} /> {getDeliveryStatusLabel(delivery.status)}</span>
                          ) : (
                            <span className="muted">هێشتا کاپتن دیاری نەکراوە</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="dashboard-panel">
              <h3><ClipboardList size={19} /> مێژووی گۆڕانکارییەکان</h3>
              {events.length === 0 ? (
                <p className="muted">هێشتا هیچ گۆڕانکارییەکی زیاتر تۆمار نەکراوە. ئەم بەشە بە نوێبوونەوەی دۆخی داواکاری پڕ دەبێت.</p>
              ) : (
                <ol className="tracking-timeline">
                  {events.map((event) => (
                    <li key={event.id} className="tracking-event">
                      <span className="tracking-event-dot" />
                      <div className="tracking-event-content">
                        <strong>{getOrderStatusLabel(event.new_status)}</strong>
                        <p className="muted">
                          {getActorLabel(event.actor_role)}
                          {event.order_store_id && storeNames.has(event.order_store_id)
                            ? ` — ${storeNames.get(event.order_store_id)}`
                            : ""}
                        </p>
                        <time dateTime={event.created_at}>{formatDate(event.created_at)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="dashboard-panel">
              <h3><MapPin size={19} /> زانیاریی گەیاندن</h3>
              <div className="tracking-address">
                <strong>{recipient || "ناوی وەرگر تۆمار نەکراوە"}</strong>
                {phone ? <a href={`tel:${phone}`} dir="ltr">{phone}</a> : null}
                <p>{addressLine || "ناونیشانی گەیاندن تۆمار نەکراوە"}</p>
              </div>
              {order.customer_note ? <p className="muted">تێبینیی کڕیار: {order.customer_note}</p> : null}
            </section>

            <section className="dashboard-panel">
              <h3>پوختەی پارەدان</h3>
              <dl className="tracking-money-list">
                <div><dt>کۆی کاڵاکان</dt><dd>{formatMoney(order.items_subtotal_iqd)}</dd></div>
                <div><dt>کرێی گەیاندن</dt><dd>{formatMoney(order.delivery_fee_iqd)}</dd></div>
                {order.discount_iqd > 0 && <div><dt>داشکاندن</dt><dd>−{formatMoney(order.discount_iqd)}</dd></div>}
                {order.tax_iqd > 0 && <div><dt>باج</dt><dd>{formatMoney(order.tax_iqd)}</dd></div>}
                <div className="tracking-money-total"><dt>کۆی گشتی</dt><dd>{formatMoney(order.total_iqd)}</dd></div>
              </dl>
              <p className="muted">شێوازی پارەدان: {paymentMethod}</p>
            </section>
          </>
        )}
      </div>
    </DashboardFrame>
  );
}

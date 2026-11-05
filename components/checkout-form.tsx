"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, MapPin, ShieldCheck } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type CheckoutAddress = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  city: string;
  district: string;
  addressLine: string;
  isDefault: boolean;
  serviceable: boolean;
  deliveryFeeIqd: number | null;
};

function money(value: number) { return value.toLocaleString("en-US") + " دینار"; }

export function CheckoutForm({
  addresses,
  hasAnyActiveZone,
  dataLoadError = false,
}: {
  addresses: CheckoutAddress[];
  hasAnyActiveZone: boolean;
  dataLoadError?: boolean;
}) {
  const router = useRouter();
  const { items, subtotalIqd, hydrated, clearCart } = useCart();
  const [addressId, setAddressId] = useState(addresses.find(x=>x.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ orderNumber: string; total: number | null } | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const selectedAddress = addresses.find(x=>x.id===addressId);
  const serviceable = selectedAddress?.serviceable === true;
  const deliveryFee = selectedAddress?.deliveryFeeIqd ?? 0;

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!hydrated || items.length === 0) { setError("سەبەتە بەتاڵە."); return; }
    if (!selectedAddress) { setError("ناونیشانی گەیاندن هەڵبژێرە."); return; }
    if (!serviceable) { setError("ئەم ناونیشانە لە ناوچەی گەیاندنی چالاکدا نییە."); return; }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!idempotencyKey.current) idempotencyKey.current = window.crypto.randomUUID();
      const { data, error: orderError } = await supabase.rpc("create_order_v1", {
        p_address_id: selectedAddress.id,
        p_items: items.map(item=>({product_id:item.productId,quantity:item.quantity})),
        p_idempotency_key: idempotencyKey.current,
        p_customer_note: note.trim() || undefined,
        p_payment_method: "cash_on_delivery",
      });
      if (orderError) throw orderError;
      const result = data && typeof data === "object" && !Array.isArray(data)
        ? data as Record<string, unknown>
        : {};
      const orderId = typeof result.order_id === "string" ? result.order_id : "";
      if (!orderId) throw new Error("ORDER_ID_MISSING");
      // The RPC succeeded, so the order exists. A follow-up read failure must not be shown as checkout failure.
      const { data: savedOrder } = await supabase
        .from("orders")
        .select("order_number,total_iqd")
        .eq("id", orderId)
        .single();
      const orderNumber = typeof savedOrder?.order_number === "string"
        ? savedOrder.order_number
        : (typeof result.order_number === "string" ? result.order_number : "—");
      const persistedTotal = Number(savedOrder?.total_iqd);
      const rpcTotal = Number(result.total_iqd);
      const total = Number.isFinite(persistedTotal)
        ? persistedTotal
        : (Number.isFinite(rpcTotal) ? rpcTotal : null);
      setSuccess({orderNumber,total});
      clearCart();
      idempotencyKey.current = null;
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "تۆمارکردنی داواکاری سەرکەوتوو نەبوو.";
      if (message.includes("DELIVERY_ZONE_UNAVAILABLE")) setError("هێشتا ناوچەی گەیاندنی چالاک بۆ ئەم ناونیشانە دانەنراوە.");
      else if (message.includes("DELIVERY_DISTANCE_NOT_CONFIGURED")) setError("ڕێژەی گەیاندنی کیلۆمەترێکی ئەم ناوچەیە هێشتا بە خزمەتگوزاریی مەودا نەبەستراوەتەوە.");
      else if (message.includes("INSUFFICIENT_STOCK")) setError("stockی یەکێک لە بەرهەمەکان بەشی ئەم داواکارییە ناکات. سەبەتە نوێ بکەرەوە.");
      else if (message.includes("PRODUCT_NOT_AVAILABLE") || message.includes("PRODUCT_NOT_FOUND")) setError("یەکێک لە بەرهەمەکان ئێستا بەردەست نییە یان لە سیستەمدا نەماوە.");
      else if (message.includes("INVALID_PRODUCT_QUANTITY")) setError("بڕی یەکێک لە بەرهەمەکان نادروستە. بڕەکان لە سەبەتە ڕێکبخە.");
      else if (message.includes("INVALID_CART_ITEMS")) setError("ناوەڕۆکی سەبەتە نادروستە. سەبەتە نوێ بکەرەوە و دووبارە هەوڵ بدە.");
      else if (message.includes("STORE_FULFILLMENT_NOT_CONFIGURED")) setError("فرۆشگایەک لە سەبەتەدا هێشتا ئامادەی وەرگرتنی داواکاری نییە.");
      else if (message.includes("ADDRESS_NOT_FOUND")) setError("ناونیشانی هەڵبژێردراو چیتر چالاک نییە. ناونیشانێکی تر هەڵبژێرە.");
      else if (message.includes("CUSTOMER_NOTE_TOO_LONG")) setError("تێبینی داواکاری زۆر درێژە.");
      else if (message.includes("INVALID_IDEMPOTENCY_KEY")) setError("کلیلێکی پاراستنی داواکاری دروست نەبوو. تکایە دووبارە هەوڵ بدە.");
      else if (message.includes("AUTH_REQUIRED")) setError("پێویستە دووبارە بچیتە ژوورەوە.");
      else if (message.includes("PAYMENT_METHOD_NOT_ENABLED")) setError("ئەم شێوازی پارەدانە هێشتا چالاک نییە.");
      else if (message.includes("CUSTOMER_ROLE_REQUIRED")) setError("هەژمارەکەت وەک کڕیار ڕێک نەخراوە.");
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) return <div className="empty-state">Checkout بار دەکرێت...</div>;
  if (dataLoadError) {
    return (
      <div className="empty-state">
        <strong>زانیاری ناونیشان یان ناوچەی گەیاندن نەخوێندرایەوە.</strong>
        <span className="muted">Checkout بۆ پاراستنی نرخ و ناونیشان تا چارەسەرکردنی پەیوەندی داتابەیس ڕاناوەستێت.</span>
        <button type="button" className="button button-secondary" style={{ marginTop: 12 }} onClick={() => router.refresh()}>
          دووبارە هەوڵ بدە
        </button>
      </div>
    );
  }
  if (success) {
    return (
      <section className="checkout-success">
        <CheckCircle2 size={48} color="#198754" />
        <h2>داواکارییەکەت تۆمار کرا</h2>
        <p>ژمارەی داواکاری: <bdi dir="ltr">{success.orderNumber}</bdi></p>
        {success.total !== null ? <strong>{money(success.total)}</strong> : <p className="muted">داواکاری تۆمار کرا؛ نەتوانرا کۆی پارە لە ئێستادا پیشان بدرێت. تکایە لە وردەکاری داواکارییەکەدا نرخەکە ببینە.</p>}
        <p className="muted">پارەدان بە کاش لە کاتی گەیاندنەوە دەکرێت. داواکارییەکەت لە داشبۆرد دەتوانیت ببینیت.</p>
        <Link href="/dashboard/orders" className="button">بینینی داواکاریەکان <ArrowLeft size={17} /></Link>
      </section>
    );
  }

  if (items.length === 0) return <div className="empty-state"><strong>سەبەتە بەتاڵە</strong><Link href="/search" className="text-link">گەڕان بۆ بەرهەم</Link></div>;
  if (addresses.length === 0) return <div className="empty-state"><MapPin size={32} color="#f36b18" /><strong>ناونیشانێکت نییە</strong><span className="muted">پێش داواکاری دەبێت ناونیشانی گەیاندن زیاد بکەیت.</span><Link href="/dashboard/addresses" className="button" style={{marginTop:12}}>زیادکردنی ناونیشان</Link></div>;

  return (
    <form className="checkout-form" onSubmit={placeOrder}>
      <section className="checkout-section">
        <div className="section-heading"><div><h2>ناونیشانی گەیاندن</h2><p>ناونیشانێک هەڵبژێرە کە لە ناوچەی خزمەتگوزاریدا بێت.</p></div></div>
        <div className="checkout-address-options">
          {addresses.map(address=>(
            <label className={"checkout-address-option" + (address.id===addressId ? " selected" : "")} key={address.id}>
              <input type="radio" name="address" value={address.id} checked={addressId===address.id} onChange={()=>setAddressId(address.id)} />
              <span><strong>{address.label} {address.isDefault ? "· بنەڕەتی" : ""}</strong><span>{address.recipientName} · <bdi dir="ltr">{address.phone}</bdi></span><span>{address.city}، {address.district}، {address.addressLine}</span>{address.serviceable ? <small className="serviceable-text">گەیاندن لەم ناونیشانەدا بەردەستە</small> : <small className="unserviceable-text">ناوچەی گەیاندن چالاک نییە</small>}</span>
            </label>
          ))}
        </div>
        <Link href="/dashboard/addresses" className="text-link">بەڕێوەبردنی ناونیشانەکان</Link>
      </section>

      <section className="checkout-section">
        <div className="section-heading"><div><h2>شێوازی پارەدان</h2><p>لە قۆناغی ئێستادا تەنها کاش لە کاتی گەیاندن پشتگیری دەکرێت.</p></div></div>
        <div className="payment-method-card"><span className="payment-cod-icon">IQD</span><span><strong>کاش لە کاتی گەیاندن</strong><small>پارەکە بە کاش بدە بە کاپتنی گەیاندن.</small></span><span className="payment-selected"><CheckCircle2 size={20} /></span></div>
      </section>

      <section className="checkout-section">
        <label htmlFor="order-note">تێبینی بۆ داواکاری (ئارەزوومەندانە)</label>
        <textarea id="order-note" rows={3} maxLength={1200} value={note} onChange={e=>setNote(e.target.value)} placeholder="تێبینی تایبەت بە داواکاری..." />
      </section>

      <aside className="checkout-total-card">
        <div className="summary-row"><span>کۆی بەرهەمەکان</span><strong>{money(subtotalIqd)}</strong></div>
        <div className="summary-row"><span>کرێی گەیاندن</span><strong>{selectedAddress?.serviceable ? money(deliveryFee) : "لە ناوچەکە دیاری نەکراوە"}</strong></div>
        <div className="summary-total"><span>کۆی پێشبینی‌کراو</span><strong>{money(subtotalIqd + (selectedAddress?.serviceable ? deliveryFee : 0))}</strong></div>
        <p className="muted summary-note">نرخ و stock لە داتابەیسەوە لە کاتی تۆمارکردن دووبارە پشتڕاست دەکرێنەوە.</p>
        {!hasAnyActiveZone && <p className="form-error">هیچ ناوچەی گەیاندنی چالاک لە پلاتفۆرمدا نییە. بەڕێوەبەر دەبێت ناوچە و نرخەکانی گەیاندن ڕێکبخات.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button checkout-button" type="submit" disabled={busy || !serviceable || !hasAnyActiveZone}>
          <ShieldCheck size={18} /> {busy ? "داواکاری دەنێردرێت..." : "تۆمارکردنی داواکاری"}
        </button>
      </aside>
    </form>
  );
}
"use client";

import Link from "next/link";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { supportsFractionalQuantity } from "@/lib/marketplace-rules";

function money(value: number) {
  return value.toLocaleString("en-US") + " دینار";
}

export function CartContent() {
  const { items, hydrated, subtotalIqd, setQuantity, removeItem } = useCart();

  if (!hydrated) return <div className="empty-state">سەبەتە بار دەکرێت...</div>;

  if (items.length === 0) {
    return (
      <div className="empty-state cart-empty">
        <ShoppingBag size={38} color="#f36b18" />
        <strong>سەبەتەکەت بەتاڵە</strong>
        <span className="muted">لە فرۆشگاکان بەرهەم هەڵبژێرە و زیاد بکە بۆ سەبەتە.</span>
        <Link href="/search" className="button" style={{ marginTop: 14 }}>گەڕان لە فرۆشگاکان <ArrowLeft size={17} /></Link>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <section className="cart-items">
        {items.map(item => {
          const fractional = supportsFractionalQuantity(item.unit);
          const step = fractional ? 0.1 : 1;
          const minimum = fractional ? 0.01 : 1;
          return (
            <article className="cart-line" key={item.productId}>
              <div className="cart-product-icon"><ShoppingBag size={24} /></div>
              <div className="cart-line-info">
                <Link href={"/stores/" + item.storeSlug} className="muted cart-store-name">{item.storeName}</Link>
                <strong>{item.productName}</strong>
                <span className="muted">{money(item.unitPriceIqd)} / {item.unit}</span>
                <div className="cart-mobile-line-total">{money(Math.round(item.unitPriceIqd * item.quantity))}</div>
              </div>
              <div className="quantity-control">
                <button type="button" aria-label="زیادکردنی بڕ" onClick={() => setQuantity(item.productId, item.quantity + step)}><Plus size={15} /></button>
                <input
                  aria-label={"بڕی " + item.productName}
                  type="number"
                  min={minimum}
                  max={item.stockQuantity ?? undefined}
                  step={fractional ? "0.01" : "1"}
                  value={item.quantity}
                  onChange={event => setQuantity(item.productId, Number(event.target.value))}
                />
                <button
                  type="button"
                  aria-label="کەمکردنەوەی بڕ"
                  onClick={() => item.quantity <= minimum
                    ? removeItem(item.productId)
                    : setQuantity(item.productId, item.quantity - step)}
                >
                  <Minus size={15} />
                </button>
              </div>
              <strong className="cart-line-total">{money(Math.round(item.unitPriceIqd * item.quantity))}</strong>
              <button type="button" className="cart-remove" onClick={() => removeItem(item.productId)} aria-label={"سڕینەوەی " + item.productName}><Trash2 size={18} /></button>
            </article>
          );
        })}
      </section>

      <aside className="cart-summary">
        <h2>پوختەی سەبەتە</h2>
        <div className="summary-row"><span>کۆی بەرهەمەکان</span><strong>{money(subtotalIqd)}</strong></div>
        <div className="summary-row"><span>کرێی گەیاندن</span><span className="muted">لە Checkout دیاری دەکرێت</span></div>
        <div className="summary-total"><span>کۆی کاتی</span><strong>{money(subtotalIqd)}</strong></div>
        <p className="muted summary-note">نرخی کۆتایی و stock لە کاتی تۆمارکردنی داواکاری لە داتابەیسەوە دووبارە پشتڕاست دەکرێنەوە.</p>
        <Link href="/checkout" className="button checkout-button">بەردەوامبوون بۆ Checkout <ArrowLeft size={18} /></Link>
        <Link href="/search" className="text-link cart-continue">زیادکردنی بەرهەمی تر</Link>
      </aside>
    </div>
  );
}

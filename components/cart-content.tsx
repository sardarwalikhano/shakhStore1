"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart, type CartLine } from "@/components/cart-provider";
import { getUnitLabelCkb } from "@/lib/marketplace-rules";

function money(value: number) {
  return value.toLocaleString("en-US") + " دینار";
}

function ProductQuantityControl({
  item,
  setQuantity,
  removeItem,
}: {
  item: CartLine;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
}) {
  const [draft, setDraft] = useState(String(item.quantity));
  useEffect(() => setDraft(String(item.quantity)), [item.quantity]);

  const min = item.minOrderQuantity;
  const max = item.maxOrderQuantity === null
    ? item.stockQuantity ?? undefined
    : item.stockQuantity === null
      ? item.maxOrderQuantity
      : Math.min(item.maxOrderQuantity, item.stockQuantity);
  const step = item.quantityStep;

  return (
    <div className="quantity-control">
      <button
        type="button"
        aria-label="زیادکردنی بڕ"
        onClick={() => setQuantity(item.productId, item.quantity + step)}
        disabled={max !== undefined && item.quantity + step > max + 0.000001}
      ><Plus size={15} /></button>
      <input
        aria-label={"بڕی " + item.productName}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          const requested = Number(draft);
          if (!draft.trim() || !Number.isFinite(requested)) setDraft(String(item.quantity));
          else setQuantity(item.productId, requested);
        }}
      />
      <button
        type="button"
        aria-label="کەمکردنەوەی بڕ"
        onClick={() => item.quantity <= min + 0.000001
          ? removeItem(item.productId)
          : setQuantity(item.productId, Math.max(min, item.quantity - step))}
      ><Minus size={15} /></button>
    </div>
  );
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
        {items.map(item => (
          <article className="cart-line" key={item.productId}>
            {item.imageUrl
              ? <img className="cart-product-photo" src={item.imageUrl} alt={item.productName} loading="lazy" />
              : <div className="cart-product-icon"><ShoppingBag size={24} /></div>}
            <div className="cart-line-info">
              <Link href={"/stores/" + item.storeSlug} className="muted cart-store-name">{item.storeName}</Link>
              <strong>{item.productName}</strong>
              <span className="muted">{money(item.unitPriceIqd)} / {getUnitLabelCkb(item.unit)}</span>
              <small className="muted">
                کەمترین بڕ: {item.minOrderQuantity} {getUnitLabelCkb(item.unit)}
                {item.maxOrderQuantity !== null ? " · زۆرترین بڕ: " + item.maxOrderQuantity : ""}
              </small>
              <div className="cart-mobile-line-total">{money(Math.round(item.unitPriceIqd * item.quantity))}</div>
            </div>
            <ProductQuantityControl item={item} setQuantity={setQuantity} removeItem={removeItem} />
            <strong className="cart-line-total">{money(Math.round(item.unitPriceIqd * item.quantity))}</strong>
            <button type="button" className="cart-remove" onClick={() => removeItem(item.productId)} aria-label={"سڕینەوەی " + item.productName}><Trash2 size={18} /></button>
          </article>
        ))}
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

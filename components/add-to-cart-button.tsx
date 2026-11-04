"use client";

import { useState } from "react";
import { Check, ShoppingBag } from "lucide-react";
import { useCart, type CartProductInput } from "@/components/cart-provider";

export function AddToCartButton({ product }: { product: CartProductInput }) {
  const { addItem, hydrated } = useCart();
  const [added, setAdded] = useState(false);
  const unavailable = product.stockQuantity !== null
    && product.stockQuantity < product.minOrderQuantity;

  function add() {
    if (!hydrated || unavailable) return;
    addItem(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <button
      type="button"
      className="button product-add-button"
      onClick={add}
      disabled={!hydrated || unavailable}
      aria-live="polite"
    >
      {added ? <Check size={17} /> : <ShoppingBag size={17} />}
      {!hydrated
        ? "سەبەتە ئامادە دەبێت..."
        : unavailable
          ? "لە کۆگا بڕی پێویست نییە"
          : added
            ? "زیادکرا بۆ سەبەتە"
            : "زیادکردن بۆ سەبەتە"}
    </button>
  );
}

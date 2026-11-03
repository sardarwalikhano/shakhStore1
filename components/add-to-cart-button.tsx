"use client";

import { useState } from "react";
import { Check, ShoppingBag } from "lucide-react";
import { useCart, type CartProductInput } from "@/components/cart-provider";

export function AddToCartButton({ product }: { product: CartProductInput }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function add() {
    addItem(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <button type="button" className="button product-add-button" onClick={add} disabled={product.stockQuantity !== null && product.stockQuantity <= 0}>
      {added ? <Check size={17} /> : <ShoppingBag size={17} />}
      {added ? "زیادکرا بۆ سەبەتە" : "زیادکردن بۆ سەبەتە"}
    </button>
  );
}
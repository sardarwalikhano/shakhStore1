"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart-provider";

export function CartHeaderButton() {
  const { itemCount, hydrated } = useCart();
  return (
    <Link href="/cart" className="icon-link cart-link" aria-label={hydrated ? "سەبەتە، " + itemCount + " دانە" : "سەبەتە"}>
      <ShoppingBag size={20} />
      {hydrated && itemCount > 0 && <span className="cart-count">{Math.ceil(itemCount)}</span>}
    </Link>
  );
}
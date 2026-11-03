"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  calculateCartSubtotal,
  isValidCartLine,
  normalizeCartQuantity,
} from "@/lib/marketplace-rules";

export type CartProductInput = {
  productId: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
  productName: string;
  unit: string;
  unitPriceIqd: number;
  stockQuantity: number | null;
};
export type CartLine = CartProductInput & { quantity: number };
type CartContextValue = {
  items: CartLine[];
  hydrated: boolean;
  itemCount: number;
  subtotalIqd: number;
  addItem: (product: CartProductInput) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
};

const STORAGE_KEY = "shakh-store-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

function isCartLine(value: unknown): value is CartLine {
  if (!isValidCartLine(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.storeId === "string"
    && typeof item.storeSlug === "string"
    && typeof item.storeName === "string"
    && typeof item.productName === "string";
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const restored = parsed.filter(isCartLine).flatMap((item) => {
              const quantity = normalizeCartQuantity(
                item.unit,
                item.quantity,
                item.stockQuantity,
              );
              return quantity === null ? [] : [{ ...item, quantity }];
            });
            setItems(restored);
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Keep the in-memory cart usable when browser storage is unavailable.
    }
  }, [items, hydrated]);

  const addItem = useCallback((product: CartProductInput) => {
    setItems((current) => {
      const quantityAvailable = product.stockQuantity ?? 999999;
      if (quantityAvailable <= 0) return current;
      const existing = current.find((item) => item.productId === product.productId);
      if (existing) {
        const quantity = normalizeCartQuantity(
          product.unit,
          existing.quantity + 1,
          product.stockQuantity,
        );
        if (quantity === null) return current;
        return current.map((item) => item.productId === product.productId
          ? {
              ...item,
              ...product,
              quantity,
            }
          : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, requested: number) => {
    setItems((current) => current.map((item) => {
      if (item.productId !== productId) return item;
      const quantity = normalizeCartQuantity(
        item.unit,
        requested,
        item.stockQuantity,
      );
      return quantity === null ? item : { ...item, quantity };
    }));
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    hydrated,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalIqd: calculateCartSubtotal(items),
    addItem,
    setQuantity,
    removeItem,
    clearCart,
  }), [items, hydrated, addItem, setQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider.");
  return context;
}

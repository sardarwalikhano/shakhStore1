"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.productId === "string"
    && typeof item.storeId === "string"
    && typeof item.storeSlug === "string"
    && typeof item.storeName === "string"
    && typeof item.productName === "string"
    && typeof item.unit === "string"
    && typeof item.unitPriceIqd === "number"
    && (typeof item.stockQuantity === "number" || item.stockQuantity === null)
    && typeof item.quantity === "number"
    && Number.isFinite(item.quantity)
    && item.quantity > 0;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed.filter(isCartLine));
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
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
    setItems(current => {
      const existing = current.find(item => item.productId === product.productId);
      const maximum = product.stockQuantity ?? 999999;
      if (existing) {
        return current.map(item => item.productId === product.productId
          ? { ...item, quantity: Math.min(maximum, item.quantity + 1) }
          : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, requested: number) => {
    if (!Number.isFinite(requested) || requested <= 0) return;
    setItems(current => current.map(item => {
      if (item.productId !== productId) return item;
      const min = item.unit === "kg" ? 0.01 : 1;
      const max = item.stockQuantity ?? 999999;
      const normalized = item.unit === "piece" || item.unit === "pack"
        ? Math.floor(requested)
        : Math.round(requested * 100) / 100;
      return { ...item, quantity: Math.min(max, Math.max(min, normalized)) };
    }));
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems(current => current.filter(item => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    hydrated,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalIqd: items.reduce((sum, item) => sum + Math.round(item.unitPriceIqd * item.quantity), 0),
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
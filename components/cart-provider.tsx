"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  calculateCartSubtotal,
  getDefaultOrderRules,
  isValidCartLine,
  normalizeCartQuantity,
} from "@/lib/marketplace-rules";

export type CartProductInput = {
  productId: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
  productName: string;
  imageUrl: string | null;
  unit: string;
  unitPriceIqd: number;
  stockQuantity: number | null;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
  quantityStep: number;
  shareCode?: string | null;
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

const STORAGE_KEY = "shakh-store-cart-v2";
const LEGACY_STORAGE_KEY = "shakh-store-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

function isCartLine(value: unknown): value is CartLine {
  if (!isValidCartLine(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.storeId === "string"
    && typeof item.storeSlug === "string"
    && typeof item.storeName === "string"
    && typeof item.productName === "string"
    && (item.imageUrl === undefined || item.imageUrl === null || typeof item.imageUrl === "string");
}

function withPurchaseDefaults(item: CartLine): CartLine {
  const defaults = getDefaultOrderRules(item.unit);
  return {
    ...item,
    imageUrl: item.imageUrl ?? null,
    minOrderQuantity: item.minOrderQuantity ?? defaults.minOrderQuantity,
    maxOrderQuantity: item.maxOrderQuantity ?? null,
    quantityStep: item.quantityStep ?? defaults.quantityStep,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const restored = parsed.filter(isCartLine).map(withPurchaseDefaults).flatMap((item) => {
              const quantity = normalizeCartQuantity(
                item.unit, item.quantity, item.stockQuantity,
                item.minOrderQuantity, item.maxOrderQuantity, item.quantityStep,
              );
              return quantity === null ? [] : [{ ...item, quantity }];
            });
            setItems(restored);
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
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
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Keep the in-memory cart usable when browser storage is unavailable.
    }
  }, [items, hydrated]);

  const addItem = useCallback((product: CartProductInput) => {
    setItems((current) => {
      const minimum = product.minOrderQuantity;
      if (product.stockQuantity !== null && product.stockQuantity < minimum) return current;
      const existing = current.find((item) => item.productId === product.productId);
      if (existing) {
        const quantity = normalizeCartQuantity(
          product.unit,
          existing.quantity + product.quantityStep,
          product.stockQuantity,
          product.minOrderQuantity,
          product.maxOrderQuantity,
          product.quantityStep,
        );
        if (quantity === null) return current;
        return current.map((item) => item.productId === product.productId
          ? { ...item, ...product, quantity }
          : item);
      }
      return [...current, { ...product, quantity: minimum }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, requested: number) => {
    setItems((current) => current.map((item) => {
      if (item.productId !== productId) return item;
      const quantity = normalizeCartQuantity(
        item.unit, requested, item.stockQuantity,
        item.minOrderQuantity, item.maxOrderQuantity, item.quantityStep,
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
    itemCount: items.length,
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

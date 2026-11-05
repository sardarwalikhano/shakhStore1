"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = { orderId: string };

export function CustomerCancelOrderAction({ orderId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancelOrder() {
    if (busy) return;
    const confirmed = window.confirm(
      "دڵنیایت دەتەوێت تەواوی ئەم داواکارییە هەڵبوەشێنیتەوە؟ هەموو فرۆشگاکانی ناو داواکارییەکە هەڵدەوەشێنرێنەوە."
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: rpcError } = await supabase.rpc("customer_cancel_order_before_pickup_v1", {
        p_order_id: orderId,
        p_reason: null,
      });
      if (rpcError) throw rpcError;
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        message.includes("ORDER_ALREADY_PICKED_UP_OR_COLLECTED") ||
        message.includes("ORDER_CONSIGNMENT_NOT_CANCELLABLE")
          ? "کڕیار ناتوانێت داواکاری هەڵبوەشێنێتەوە؛ کاپتن پێشتر کاڵاکەی وەرگرتووە یان گەیاندنی دەستی پێکردووە."
          : message.includes("ORDER_NOT_ELIGIBLE_FOR_CUSTOMER_CANCELLATION")
            ? "ئەم داواکارییە بۆ هەڵوەشاندنەوەی ئۆتۆماتیکی گونجاو نییە."
            : message.includes("ORDER_NOT_FOUND")
              ? "داواکاری نەدۆزرایەوە یان دەسەڵاتی بینینت نییە."
              : message || "هەڵوەشاندنەوە سەرکەوتوو نەبوو. دووبارە هەوڵ بدەرەوە.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workflow-action-wrap">
      <button
        type="button"
        className="button button-secondary"
        onClick={cancelOrder}
        disabled={busy}
      >
        {busy ? "هەڵوەشاندنەوە..." : "هەڵوەشاندنەوەی تەواوی داواکاری"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCaptainDeliveryAction, getMerchantOrderAction } from "@/lib/order-workflow-rules";

type Props =
  | { scope: "merchant"; recordId: string; status: string }
  | { scope: "captain"; recordId: string; status: string };

export function OrderWorkflowAction({ scope, recordId, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const action = scope === "merchant"
    ? getMerchantOrderAction(status)
    : getCaptainDeliveryAction(status);

  async function advance() {
    if (!action || busy) return;
    setBusy(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const result = scope === "merchant"
        ? await supabase.rpc("merchant_update_order_store_status_v1", {
            p_order_store_id: recordId,
            p_new_status: action.nextStatus,
          })
        : await supabase.rpc("captain_update_delivery_status_v1", {
            p_assignment_id: recordId,
            p_new_status: action.nextStatus,
          });

      if (result.error) throw result.error;
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        message.includes("INVALID_ORDER_TRANSITION") ||
        message.includes("INVALID_DELIVERY_TRANSITION")
          ? "ئەم گۆڕانکارییە لە ڕێڕەوی کاردا ڕێگەپێدراو نییە."
          : message.includes("ORDER_NOT_READY_FOR_PICKUP")
            ? "داواکاری هێشتا ئامادەی وەرگرتن نییە."
            : message.includes("NOT_OWNED") || message.includes("NOT_ASSIGNED_TO_CAPTAIN")
              ? "دەسەڵاتی ئەم کردارەت نییە."
              : message || "گۆڕینی دۆخ سەرکەوتوو نەبوو.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!action) return null;

  return (
    <div className="workflow-action-wrap">
      <button type="button" className="button workflow-action" onClick={advance} disabled={busy}>
        {busy ? "چاوەڕێ بکە..." : action.label}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

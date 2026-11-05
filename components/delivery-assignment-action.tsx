"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type CaptainOption = {
  user_id: string;
  full_name: string;
  email: string | null;
  scope_type: "global" | "zones";
  is_active: boolean;
  zone_ids: string[];
  email_confirmed: boolean;
};

type Props = {
  assignmentId: string;
  assignmentStatus: string;
  storeStatus: string | undefined;
  captains: CaptainOption[];
};

export function DeliveryAssignmentAction({
  assignmentId,
  assignmentStatus,
  storeStatus,
  captains,
}: Props) {
  const router = useRouter();
  const [captainId, setCaptainId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (assignmentStatus !== "awaiting_captain" || storeStatus !== "ready_for_pickup") {
    return null;
  }

  if (captains.length === 0) {
    return (
      <p className="muted delivery-assignment-hint">
        هیچ کاپتنێکی چالاک و پشتڕاستکراو بۆ ئەم زۆنە نییە. مەودای کاپتنەکان لە بەشی «کاپتنەکان» ڕێکبخە.
      </p>
    );
  }

  async function assign() {
    if (!captainId || busy) return;
    setBusy(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: rpcError } = await supabase.rpc("admin_assign_delivery_captain_v1", {
        p_assignment_id: assignmentId,
        p_captain_user_id: captainId,
      });
      if (rpcError) throw rpcError;
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        message.includes("TARGET_USER_IS_NOT_CAPTAIN")
          ? "ئەم هەژمارە ڕۆڵی کاپتنی نییە."
          : message.includes("CAPTAIN_OUTSIDE_ASSIGNED_ZONES")
            ? "ئەم کاپتنە مۆڵەتی کارکردنی لەم زۆنەدا نییە."
            : message.includes("CAPTAIN_SCOPE_INACTIVE") || message.includes("CAPTAIN_SCOPE_NOT_CONFIGURED")
              ? "مەودای کاری کاپتن چالاک نییە؛ ڕێکخستنی کاپتن پشکنە."
          : message.includes("ORDER_NOT_READY_FOR_PICKUP")
            ? "فرۆشگا هێشتا داواکارییەکەی ئامادە نەکردووە."
            : message || "دیاریکردنی کاپتن سەرکەوتوو نەبوو.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delivery-assignment-action">
      <label htmlFor={`captain-${assignmentId}`}>دیاریکردنی کاپتن</label>
      <div className="delivery-assignment-controls">
        <select
          id={`captain-${assignmentId}`}
          value={captainId}
          onChange={(event) => setCaptainId(event.target.value)}
          disabled={busy}
        >
          <option value="">کاپتن هەڵبژێرە</option>
          {captains.map((captain) => (
            <option key={captain.user_id} value={captain.user_id}>
              {captain.full_name}{captain.email ? ` — ${captain.email}` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="button workflow-action" onClick={assign} disabled={busy || !captainId}>
          {busy ? "چاوەڕێ بکە..." : "سپاردنی گەیاندن"}
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

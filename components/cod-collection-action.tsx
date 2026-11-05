"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  assignmentId: string;
  collectedAt?: string | null;
  collectedAmountIqd?: number | null;
};

export function CodCollectionAction({
  assignmentId,
  collectedAt = null,
  collectedAmountIqd = null,
}: Props) {
  const router = useRouter();
  const [expectedCashIqd, setExpectedCashIqd] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(!collectedAt);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState<number | null>(null);

  useEffect(() => {
    if (collectedAt) {
      setLoadingQuote(false);
      return;
    }
    let active = true;
    async function loadQuote() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: quoteError } = await supabase.rpc("captain_get_cod_collection_quote_v1", {
          p_assignment_id: assignmentId,
        });
        if (quoteError) throw quoteError;
        const quote = data as { expected_cash_iqd?: number | string };
        const expected = Number(quote.expected_cash_iqd);
        if (!Number.isSafeInteger(expected) || expected <= 0) {
          throw new Error("COD_QUOTE_INVALID");
        }
        if (active) {
          setExpectedCashIqd(expected);
          setAmount(String(expected));
        }
      } catch (caught) {
        if (active) {
          const message = caught instanceof Error ? caught.message : "";
          setError(message || "نەتوانرا بڕی نەقدی پێویست دیاری بکرێت.");
        }
      } finally {
        if (active) setLoadingQuote(false);
      }
    }
    void loadQuote();
    return () => { active = false; };
  }, [assignmentId, collectedAt]);

  if (collectedAt || success) {
    return (
      <div className="dashboard-panel" style={{ marginTop: 14, borderColor: "#b9dfc7" }}>
        <strong style={{ color: "#197344" }}>وەرگرتنی نەقد پشتڕاست کراوەتەوە</strong>
        <p className="muted" style={{ margin: "5px 0 0" }}>
          {Number(collectedAmountIqd ?? successAmount ?? expectedCashIqd ?? 0).toLocaleString("en-US")} دینار
          {collectedAt ? ` — ${new Date(collectedAt).toLocaleString("ckb-IQ")}` : ""}
        </p>
      </div>
    );
  }

  async function confirmCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || expectedCashIqd === null) return;
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount !== expectedCashIqd) {
      setError("بڕی نەقد دەبێت یەکسان بێت بە بڕی داواکراو.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: rpcError } = await supabase.rpc("captain_confirm_cod_collection_v1", {
        p_assignment_id: assignmentId,
        p_cash_received_iqd: parsedAmount,
        p_receipt_reference: receipt.trim() || null,
      });
      if (rpcError) throw rpcError;
      setSuccessAmount(parsedAmount);
      setSuccess(true);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        message.includes("COD_AMOUNT_MISMATCH")
          ? "بڕی نەقد لەگەڵ بڕی هەژمارکراو ناگونجێت."
          : message.includes("DELIVERY_MUST_BE_DELIVERED")
            ? "سەرەتا دۆخی گەیاندن دەبێت گەیشتوو بێت."
            : message.includes("NOT_ASSIGNED_TO_CAPTAIN")
              ? "ئەم گەیاندنە بە ناوی تۆوە نییە."
              : message || "پشتڕاستکردنەوەی وەرگرتنی نەقد سەرکەوتوو نەبوو.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadingQuote) {
    return <div className="dashboard-panel" style={{ marginTop: 14 }}>هەژمارکردنی بڕی نەقدی پێویست...</div>;
  }

  if (expectedCashIqd === null) {
    return (
      <div className="dashboard-panel" style={{ marginTop: 14 }}>
        <strong>نەتوانرا بڕی نەقد پشتڕاست بکرێتەوە</strong>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form className="dashboard-panel" onSubmit={confirmCollection} style={{ marginTop: 14, display: "grid", gap: 10 }}>
      <div>
        <strong>پشتڕاستکردنەوەی نەقدی کڕیار</strong>
        <p className="muted" style={{ margin: "5px 0 0" }}>
          تەنها دوای وەرگرتنی تەواوی نەقد، ئەم کردارە ئەنجام بدە. بڕی پێویست:
          {" "}<strong>{expectedCashIqd.toLocaleString("en-US")} دینار</strong>
        </p>
      </div>
      <label style={{ display: "grid", gap: 5 }}>
        <span>بڕی نەقدی وەرگیراو (دینار)</span>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-label="بڕی نەقدی وەرگیراو"
        />
      </label>
      <label style={{ display: "grid", gap: 5 }}>
        <span>ژمارەی پسووڵە (ئارەزوومەندانە)</span>
        <input
          type="text"
          maxLength={160}
          value={receipt}
          onChange={(event) => setReceipt(event.target.value)}
          placeholder="ژمارەی پسووڵە یان سەرچاوە"
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "چاوەڕێ بکە..." : "نەقد وەرگیراوە — پشتڕاستی بکەوە"}
      </button>
    </form>
  );
}

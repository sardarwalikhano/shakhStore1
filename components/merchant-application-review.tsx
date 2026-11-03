"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, ShieldCheck, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

type Application = Pick<
  Tables<"merchant_applications">,
  | "id"
  | "business_name"
  | "merchant_category"
  | "description"
  | "contact_person"
  | "phone"
  | "city"
  | "district"
  | "address_line"
  | "status"
  | "submitted_at"
  | "review_note"
>;

const categoryLabels: Record<string, string> = {
  restaurant: "چێشتخانە",
  supermarket: "سوپەرمارکێت",
  fruits_vegetables: "سەوزە و میوە",
  meat_seafood: "گۆشت و سپیاتی",
};

const statusLabels: Record<string, string> = {
  submitted: "نێردراوە",
  under_review: "لەژێر پشکنیندایە",
  approved: "پەسەند کراوە",
  rejected: "ڕەتکرایەوە",
};

export function MerchantApplicationReview({
  initialApplications,
}: {
  initialApplications: Application[];
}) {
  const router = useRouter();
  const [applications, setApplications] = useState(initialApplications);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function review(application: Application, decision: "start_review" | "approve" | "reject") {
    const reviewNote = (notes[application.id] ?? "").trim();
    if (decision === "reject" && reviewNote.length < 2) {
      setError("بۆ ڕەتکردنەوە، تکایە هۆکاری ڕوون بنووسە.");
      return;
    }
    if (decision === "approve" && !window.confirm("دڵنیایت لە پەسەندکردنی ئەم داواکارییە؟ دوای پەسەندکردن ڕۆڵی دوکانداری بۆ خاوەن داواکاری دیاری دەکرێت.")) {
      return;
    }
    setBusyId(application.id);
    setError("");
    setSuccess("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "review-merchant-application",
        { body: { applicationId: application.id, decision, reviewNote } },
      );
      if (invokeError) throw invokeError;
      if (data && typeof data === "object" && "error" in data) {
        throw new Error(String(data.error));
      }
      const nextStatus = decision === "start_review"
        ? "under_review"
        : decision === "approve"
          ? "approved"
          : "rejected";
      setApplications((current) => current.map((item) =>
        item.id === application.id
          ? { ...item, status: nextStatus, review_note: reviewNote || null }
          : item
      ));
      setSuccess(
        decision === "approve"
          ? "داواکاری پەسەند کرا و ڕۆڵی دوکانداری بۆ هەژمارەکە دانرا."
          : decision === "reject"
            ? "داواکارییەکە ڕەتکرایەوە."
            : "داواکارییەکە خرایە ژێر پشکنین.",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "کرداری پشکنین سەرکەوتوو نەبوو.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = applications.filter((item) =>
    item.status === "submitted" || item.status === "under_review"
  );
  const completed = applications.filter((item) =>
    item.status === "approved" || item.status === "rejected"
  );

  return (
    <div className="application-review">
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      <section className="application-review-section">
        <div className="section-heading">
          <div>
            <h2>داواکارییە نوێکان</h2>
            <p>{pending.length.toLocaleString("en-US")} داواکاری پێویستی بە پشکنین هەیە.</p>
          </div>
        </div>
        {pending.length === 0 ? (
          <div className="empty-state"><ShieldCheck size={30} color="#d96b24" /><strong>هیچ داواکارییەکی چاوەڕوان نییە</strong><span className="muted">کاتێک داواکاری نوێ بنێردرێت، لێرە دەردەکەوێت.</span></div>
        ) : (
          <div className="application-review-list">
            {pending.map((application) => (
              <article className="application-review-card" key={application.id}>
                <div className="application-review-top">
                  <div>
                    <span className="category-pill">{categoryLabels[application.merchant_category] ?? "فرۆشگا"}</span>
                    <h3>{application.business_name}</h3>
                    <p>{application.contact_person} · <bdi dir="ltr">{application.phone}</bdi></p>
                  </div>
                  <span className="role-badge"><Clock3 size={14} /> {statusLabels[application.status] ?? application.status}</span>
                </div>
                <div className="application-review-details">
                  <span>{application.city}، {application.district}</span>
                  <span>{application.address_line}</span>
                  {application.description && <p>{application.description}</p>}
                  <small>نێردراوە: {new Date(application.submitted_at).toLocaleDateString("ckb-IQ")}</small>
                  {application.review_note && <p className="application-review-note">تێبینی پێشوو: {application.review_note}</p>}
                </div>
                <label className="application-note-field">
                  <span>تێبینی پشکنین {application.status === "submitted" ? "(ئارەزوومەندانە)" : ""}</span>
                  <textarea
                    rows={2}
                    maxLength={1200}
                    value={notes[application.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                    placeholder="هۆکار یان تێبینی بۆ ئەم داواکارییە..."
                  />
                </label>
                <div className="application-review-actions">
                  {application.status === "submitted" && (
                    <button type="button" className="button button-secondary" disabled={busyId !== null} onClick={() => review(application, "start_review")}>
                      <Clock3 size={16} /> دەستپێکردنی پشکنین
                    </button>
                  )}
                  <button type="button" className="button" disabled={busyId !== null} onClick={() => review(application, "approve")}>
                    <Check size={16} /> {busyId === application.id ? "چاوەڕێ بکە..." : "پەسەندکردن"}
                  </button>
                  <button type="button" className="button button-danger" disabled={busyId !== null} onClick={() => review(application, "reject")}>
                    <X size={16} /> ڕەتکردنەوە
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section className="application-review-section">
          <div className="section-heading"><div><h2>مێژووی پشکنین</h2><p>کۆی {completed.length.toLocaleString("en-US")} داواکاری تەواوکراو.</p></div></div>
          <div className="application-review-history">
            {completed.map((application) => (
              <div className="application-history-row" key={application.id}>
                <span><strong>{application.business_name}</strong><small>{categoryLabels[application.merchant_category] ?? "فرۆشگا"}</small></span>
                <span className={application.status === "approved" ? "status-pill status-approved" : "status-pill status-rejected"}>
                  {statusLabels[application.status] ?? application.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Gift, XCircle } from "lucide-react";
import {
  reviewPostShareRewardClaimAction,
  type ShareRewardActionState,
} from "@/app/dashboard/share-rewards/actions";

export type ShareRewardClaimView = {
  id: string;
  post_id: string;
  post_title_snapshot: string;
  post_slug_snapshot: string;
  customer_user_id: string;
  customer_name: string;
  reward_amount_iqd: number;
  proof_url: string;
  status: "pending" | "paid" | "rejected";
  created_at: string;
  review_note: string | null;
};

const initialState: ShareRewardActionState = { status: "idle", message: "" };

function ReviewForm({ claim }: { claim: ShareRewardClaimView }) {
  const [state, formAction, pending] = useActionState(reviewPostShareRewardClaimAction, initialState);
  if (claim.status !== "pending") return null;
  return (
    <form action={formAction} className="share-reward-review-form">
      <input type="hidden" name="claim_id" value={claim.id} />
      <label htmlFor={"review-note-" + claim.id}>تێبینی پشکنین / هۆکاری ڕەتکردنەوە</label>
      <textarea id={"review-note-" + claim.id} name="review_note" rows={2} maxLength={1000} placeholder="بۆ ڕەتکردنەوە، هۆکار بنووسە." />
      <div className="share-reward-review-actions">
        <button className="button" type="submit" name="decision" value="approve" disabled={pending}>
          <CheckCircle2 size={16} /> پەسەندکردن و ناردنی پارە
        </button>
        <button className="button button-secondary" type="submit" name="decision" value="reject" disabled={pending}>
          <XCircle size={16} /> ڕەتکردنەوە
        </button>
      </div>
      {state.message && (
        <p className={state.status === "success" ? "form-success" : "form-error"} role={state.status === "success" ? "status" : "alert"}>
          {state.message}
        </p>
      )}
    </form>
  );
}

function statusLabel(status: string) {
  if (status === "paid") return "پارە دراوە";
  if (status === "rejected") return "ڕەتکراوەتەوە";
  return "چاوەڕێی پشکنین";
}

export function ShareRewardClaimsManager({
  claims,
  mode,
}: {
  claims: ShareRewardClaimView[];
  mode: "admin" | "customer";
}) {
  const pendingCount = claims.filter((claim) => claim.status === "pending").length;
  const paidTotal = claims.filter((claim) => claim.status === "paid")
    .reduce((sum, claim) => sum + claim.reward_amount_iqd, 0);

  return (
    <div className="share-reward-claims">
      <section className="dashboard-metrics">
        <article><span>داواکاریی چاوەڕێ</span><strong>{pendingCount}</strong></article>
        <article><span>پاداشتی گەیشتوو</span><strong>{paidTotal.toLocaleString("en-US")} دینار</strong></article>
        <article><span>کۆی داواکارییەکان</span><strong>{claims.length}</strong></article>
      </section>

      {claims.length === 0 ? (
        <div className="empty-state">
          <Gift size={30} />
          <strong>{mode === "admin" ? "هیچ داواکاریی پاداشتێک نییە" : "هێشتا داواکاریی پاداشتت نییە"}</strong>
          <span className="muted">دوای هاوبەشکردنی پۆست و ناردنی بەڵگە، داواکارییەکان لێرە دەردەکەون.</span>
          {mode === "customer" && <Link href="/posts" className="text-link">بینینی پۆستەکان</Link>}
        </div>
      ) : (
        <div className="share-reward-claim-list">
          {claims.map((claim) => (
            <article className="dashboard-panel share-reward-claim-card" key={claim.id}>
              <div className="share-reward-claim-heading">
                <div>
                  <span className={"role-badge " + (claim.status === "pending" ? "captain-pending" : claim.status === "paid" ? "role-badge-success" : "captain-disabled")}>
                    {statusLabel(claim.status)}
                  </span>
                  <h3>{claim.post_title_snapshot}</h3>
                  <p className="muted">{claim.customer_name}</p>
                </div>
                <strong>{claim.reward_amount_iqd.toLocaleString("en-US")} دینار</strong>
              </div>
              <div className="share-reward-proof-link">
                <span>بەڵگەی هاوبەشکردن:</span>
                <a href={claim.proof_url} target="_blank" rel="noreferrer">
                  کردنەوەی لینک <ExternalLink size={15} />
                </a>
              </div>
              <p className="muted">
                {new Date(claim.created_at).toLocaleString("ckb-IQ", { dateStyle: "medium", timeStyle: "short" })}
                {" · "}
                <Link href={"/posts/" + claim.post_slug_snapshot} className="text-link">بینینی پۆست</Link>
              </p>
              {claim.review_note && <p className="muted">تێبینی پشکنین: {claim.review_note}</p>}
              {mode === "admin" && <ReviewForm claim={claim} />}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

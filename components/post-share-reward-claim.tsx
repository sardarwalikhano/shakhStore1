"use client";

import { useActionState, useState } from "react";
import { Gift, Link2, Send } from "lucide-react";
import Link from "next/link";
import {
  submitPostShareRewardClaimAction,
  type ShareRewardActionState,
} from "@/app/dashboard/share-rewards/actions";

const initialState: ShareRewardActionState = { status: "idle", message: "" };

type ExistingClaim = {
  status: string;
  review_note: string | null;
};

export function PostShareRewardClaim({
  postId,
  rewardAmountIqd,
  remainingClaims,
  existingClaim,
}: {
  postId: string;
  rewardAmountIqd: number;
  remainingClaims: number;
  existingClaim: ExistingClaim | null;
}) {
  const [state, formAction, pending] = useActionState(submitPostShareRewardClaimAction, initialState);
  const [shareMessage, setShareMessage] = useState("");

  async function sharePost() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, text: "ئەم پۆستە لە شاخ ستور ببینە", url });
        setShareMessage("لینکی پۆست هاوبەش کرا. دوای بڵاوکردنەوە، لینکی بەڵگەکە لە خانەی خوارەوە بنووسە.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("لینکی پۆست کۆپی کرا. لە تۆڕی کۆمەڵایەتی دایبنێ و لینکی بڵاوکراوەکە بنێرە.");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("لینکی پۆست کۆپی کرا. لە تۆڕی کۆمەڵایەتی دایبنێ و لینکی بڵاوکراوەکە بنێرە.");
      } catch {
        setShareMessage("نەتوانرا لینکەکە کۆپی بکرێت؛ لینکی پەڕەکە بە دەستی کۆپی بکە.");
      }
    }
  }

  return (
    <section className="post-share-reward-card">
      <div className="post-share-reward-heading">
        <span className="post-share-reward-icon"><Gift size={23} /></span>
        <div>
          <span className="eyebrow">SHARE & EARN</span>
          <h2>بە هاوبەشکردنی ئەم پۆستە پاداشت وەربگرە</h2>
          <strong className="post-share-reward-amount">
            {rewardAmountIqd.toLocaleString("en-US")} دینار
          </strong>
          <small className="muted">ژمارەی ماوەی پاداشت: {remainingClaims.toLocaleString("en-US")}</small>
        </div>
      </div>

      {remainingClaims <= 0 && existingClaim?.status !== "pending" && existingClaim?.status !== "paid" ? (
        <p className="post-share-reward-pending" role="status">هەموو پاداشتەکانی ئەم پۆستە داواکراون.</p>
      ) : existingClaim?.status === "paid" ? (
        <p className="form-success" role="status">پاداشتی ئەم پۆستەت پێشتر پەسەند کراوە و بۆ جزدانی تۆ گوازراوەتەوە.</p>
      ) : existingClaim?.status === "pending" ? (
        <p className="post-share-reward-pending" role="status">داواکاری پاداشتت نێردراوە و چاوەڕێی پشکنینی سوپەر ئەدمینە.</p>
      ) : (
        <>
          {existingClaim?.status === "rejected" && (
            <p className="form-error" role="alert">
              داواکاری پێشووت ڕەتکرایەوە: {existingClaim.review_note ?? "بەڵگەکە پەسەند نەکرا."} دەتوانیت بەڵگەی نوێ بنێریت.
            </p>
          )}
          <p className="muted">
            پۆستەکە لە تۆڕە کۆمەڵایەتییەکان هاوبەش بکە، پاشان لینکی پەڕەی بڵاوکراوەکە لێرە بنووسە.
            سوپەر ئەدمین بەڵگەکە دەپشکنێت؛ پاداشت تەنها دوای پەسەندکردن دەچێتە جزدانی تۆ.
          </p>
          <button type="button" className="button button-secondary" onClick={sharePost}>
            <Link2 size={17} /> هاوبەشکردنی لینکی پۆست
          </button>
          {shareMessage && <small className="muted" role="status">{shareMessage}</small>}
          <form action={formAction} className="post-share-reward-form">
            <input type="hidden" name="post_id" value={postId} />
            <label htmlFor={"share-proof-" + postId}>لینکی بەڵگەی هاوبەشکردن *</label>
            <input
              id={"share-proof-" + postId}
              name="proof_url"
              type="url"
              inputMode="url"
              placeholder="https://..."
              pattern="https://.*"
              required
              maxLength={2000}
              dir="ltr"
            />
            <button className="button" type="submit" disabled={pending}>
              <Send size={16} /> {pending ? "داواکاری دەنێردرێت..." : "ناردنی داواکاری پاداشت"}
            </button>
            {state.message && (
              <p className={state.status === "success" ? "form-success" : "form-error"} role={state.status === "success" ? "status" : "alert"}>
                {state.message}
              </p>
            )}
          </form>
        </>
      )}
      <small className="muted">پاداشت بۆ هەر کڕیارێک بۆ هەر پۆستێک تەنها یەک جار دەدرێت و لەبەر پشکنینی سوپەر ئەدمینەوە پەسەند دەکرێت.</small>
      <Link href="/dashboard/share-rewards" className="text-link">دۆخی داواکارییەکانی پاداشتم ببینە</Link>
    </section>
  );
}

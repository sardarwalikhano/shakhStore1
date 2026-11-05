"use client";

import { useState, useTransition } from "react";
import { Gift, Link2, Copy, Share2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { createPostShareLinkAction } from "@/app/dashboard/share-rewards/actions";

export function PostShareRewardClaim({
  postId,
  postSlug,
  rewardAmountIqd,
}: {
  postId: string;
  postSlug: string;
  rewardAmountIqd: number;
}) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function createLink() {
    setMessage("");
    startTransition(async () => {
      const result = await createPostShareLinkAction(postId);
      if (!result.ok || !result.shareCode) {
        setMessage(result.message);
        return;
      }
      setUrl(window.location.origin + "/posts/" + encodeURIComponent(postSlug) + "?ref=" + encodeURIComponent(result.shareCode));
      setMessage("لینکی تایبەتت دروست کرا. هەر داواکارییەک کە لەو لینکەوە بکرێت و تەواو بگات، خەڵاتەکەی دەچێتە جزدانی تۆ.");
    });
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("لینکی تایبەت کۆپی کرا.");
    } catch {
      setMessage("نەتوانرا لینکەکە کۆپی بکرێت؛ دەقی لینکی خوارەوە دەستنووس بکە.");
    }
  }

  async function shareLink() {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: document.title, text: "پۆستەکە لە شاخ ستور ببینە", url });
      else await copyLink();
    } catch {
      // A dismissed native share sheet is not an application error.
    }
  }

  return (
    <section className="post-share-reward-card">
      <div className="post-share-reward-heading">
        <span className="post-share-reward-icon"><Gift size={23} /></span>
        <div>
          <span className="eyebrow">SHARE & EARN</span>
          <h2>لینکی تایبەتی خۆت هاوبەش بکە</h2>
          <strong className="post-share-reward-amount">{rewardAmountIqd.toLocaleString("en-US")} دینار بۆ هەر کڕینی تەواوبوو</strong>
          <small className="muted">سنووری ژمارەی کڕین نییە. خەڵات تەنها دوای گەیاندنی داواکاری لە جزدانی خاوەنی پۆست دەدرێتەوە.</small>
        </div>
      </div>
      {!url ? (
        <button type="button" className="button" onClick={createLink} disabled={pending}>
          <Link2 size={17} /> {pending ? "لینک دروست دەکرێت..." : "دروستکردنی لینکی تایبەتی من"}
        </button>
      ) : (
        <div className="post-share-reward-form">
          <label htmlFor={"share-link-" + postId}>لینکی تایبەت</label>
          <input id={"share-link-" + postId} type="url" readOnly value={url} dir="ltr" />
          <div className="post-share-reward-actions">
            <button type="button" className="button button-secondary" onClick={copyLink}><Copy size={16} /> کۆپی کردن</button>
            <button type="button" className="button" onClick={shareLink}><Share2 size={16} /> هاوبەشکردن</button>
          </div>
        </div>
      )}
      {message && <p className="muted" role="status">{message}</p>}
      <Link href="/dashboard/share-rewards" className="text-link"><ExternalLink size={15} /> بینینی کڕین و خەڵاتەکانم</Link>
    </section>
  );
}

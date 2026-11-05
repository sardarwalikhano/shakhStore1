"use client";

import { Gift } from "lucide-react";

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

/**
 * Legacy manual-proof view is intentionally retired.
 * Share & Earn now attributes actual orders and settles the reward only when delivered.
 */
export function ShareRewardClaimsManager() {
  return (
    <section className="empty-state">
      <Gift size={28} />
      <strong>پشکنینی بەڵگەی دەستی وەستێنراوە.</strong>
      <span className="muted">خەڵاتی شێر ئێستا بە شێوەی خۆکار تەنها دوای گەیاندنی داواکاری هەژمار دەکرێت.</span>
    </section>
  );
}

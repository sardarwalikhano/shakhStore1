"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ShareRewardActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function shareError(message: string) {
  if (message.includes("CUSTOMER_REQUIRED")) return "تەنها هەژماری کڕیار دەتوانێت داوای پاداشت بکات.";
  if (message.includes("SUPER_ADMIN_REQUIRED")) return "تەنها سوپەر ئەدمین دەتوانێت داواکاری پاداشت پەسەند یان ڕەت بکاتەوە.";
  if (message.includes("INVALID_SHARE_PROOF_URL")) return "لینکی بەڵگە دەبێت لینکی HTTPS ـی دروستی پۆستی هاوبەشکراو بێت.";
  if (message.includes("SHARE_REWARD_ALREADY_REQUESTED")) return "پێشتر داواکاری پاداشتت بۆ ئەم پۆستە ناردووە.";
  if (message.includes("SHARE_REWARD_NOT_ACTIVE")) return "پاداشتی ئەم پۆستە ئێستا چالاک نییە.";
  if (message.includes("SHARE_REWARD_CLAIMS_LIMIT_REACHED")) return "ژمارەی پاداشتەکانی ئەم پۆستە تەواو بووە.";
  if (message.includes("POST_AUTHOR_CANNOT_CLAIM_REWARD") || message.includes("STORE_OWNER_CANNOT_CLAIM_REWARD")) return "خاوەنی پۆست یان فرۆشگا ناتوانێت پاداشتی پۆستی خۆی وەربگرێت.";
  if (message.includes("SHARE_REWARD_CLAIM_ALREADY_REVIEWED")) return "ئەم داواکارییە پێشتر پشکنراوە.";
  if (message.includes("REJECTION_REASON_REQUIRED")) return "بۆ ڕەتکردنەوەی داواکاری، هۆکار بنووسە.";
  if (message.includes("SHARE_REWARD_ESCROW_INSUFFICIENT")) return "بودجەی پارێزراوی پاداشت بەشی ئەم داواکارییە ناکات.";
  return "کردارەکە سەرکەوتوو نەبوو. زانیارییەکان و دەسەڵاتەکان پشکنە.";
}

export async function submitPostShareRewardClaimAction(
  _previousState: ShareRewardActionState,
  formData: FormData,
): Promise<ShareRewardActionState> {
  const postId = field(formData, "post_id");
  const proofUrl = field(formData, "proof_url");
  if (!uuidPattern.test(postId)) return { status: "error", message: "ناسنامەی پۆست دروست نییە." };
  try {
    const parsed = new URL(proofUrl);
    if (parsed.protocol !== "https:" || proofUrl.length > 2000) throw new Error("invalid");
  } catch {
    return { status: "error", message: "لینکی بەڵگە دەبێت بە https:// دەست پێ بکات و دروست بێت." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "پەیوەندی بە خزمەتگوزاری بەردەست نییە." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "بۆ داوای پاداشت، سەرەتا بچۆ ژوورەوە." };
  if (user.app_metadata?.role !== "customer") return { status: "error", message: "ئەم تایبەتمەندییە تەنها بۆ هەژماری کڕیارە." };

  const { error } = await supabase.rpc("submit_post_share_reward_claim_v1", {
    p_post_id: postId,
    p_proof_url: proofUrl,
  });
  if (error) return { status: "error", message: shareError(error.message) };
  revalidatePath("/dashboard/share-rewards");
  revalidatePath("/posts");
  return {
    status: "success",
    message: "داواکاری پاداشت نێردرا. سوپەر ئەدمین بەڵگەکە دەپشکنێت و ئەگەر پەسەندی بکات، پارەکە بۆ جزدانی تۆ دەگوازرێتەوە.",
  };
}

export async function reviewPostShareRewardClaimAction(
  _previousState: ShareRewardActionState,
  formData: FormData,
): Promise<ShareRewardActionState> {
  const claimId = field(formData, "claim_id");
  const decision = field(formData, "decision");
  const reviewNote = field(formData, "review_note");
  if (!uuidPattern.test(claimId)) return { status: "error", message: "ناسنامەی داواکاری دروست نییە." };
  if (decision !== "approve" && decision !== "reject") return { status: "error", message: "بڕیاری پشکنین دروست نییە." };
  if (decision === "reject" && reviewNote.length < 2) return { status: "error", message: "بۆ ڕەتکردنەوە، هۆکاری ڕوون بنووسە." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "پەیوەندی بە خزمەتگوزاری بەردەست نییە." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "super_admin") {
    return { status: "error", message: "تەنها سوپەر ئەدمین دەتوانێت داواکاری پاداشت پشکنێت." };
  }

  const { error } = await supabase.rpc("review_post_share_reward_claim_v1", {
    p_claim_id: claimId,
    p_decision: decision,
    p_review_note: reviewNote || null,
  });
  if (error) return { status: "error", message: shareError(error.message) };
  revalidatePath("/dashboard/share-rewards");
  revalidatePath("/dashboard/posts");
  return {
    status: "success",
    message: decision === "approve"
      ? "پاداشت پەسەند کرا و پارەکە بۆ جزدانی کڕیار گوازرایەوە."
      : "داواکاری پاداشت ڕەتکرایەوە؛ بودجەکە لە escrow دەمێنێتەوە بۆ داواکارییەکی تر.",
  };
}

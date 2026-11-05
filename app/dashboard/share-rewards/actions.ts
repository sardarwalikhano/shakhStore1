"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateShareLinkResult = { ok: boolean; message: string; shareCode?: string };

export async function createPostShareLinkAction(postId: string): Promise<CreateShareLinkResult> {
  if (!uuidPattern.test(postId)) return { ok: false, message: "ناسنامەی پۆست دروست نییە." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "پەیوەندی بە خزمەتگوزاری بەردەست نییە." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "customer") {
    return { ok: false, message: "بۆ دروستکردنی لینکی خەڵات، دەبێت بە هەژماری کڕیار بچیتە ژوورەوە." };
  }
  const { data, error } = await supabase.rpc("create_post_share_link_v1", { p_post_id: postId });
  if (error) {
    if (error.message.includes("POST_AUTHOR_CANNOT_SHARE") || error.message.includes("STORE_OWNER_CANNOT_SHARE")) {
      return { ok: false, message: "خاوەنی پۆست و دوکان ناتوانن لینکی خەڵاتی پۆستی خۆیان دروست بکەن." };
    }
    if (error.message.includes("SHARE_REWARD_NOT_ACTIVE")) {
      return { ok: false, message: "خەڵاتی ئەم پۆستە ئێستا چالاک نییە." };
    }
    return { ok: false, message: "دروستکردنی لینکی تایبەت سەرکەوتوو نەبوو." };
  }
  const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  return typeof result.share_code === "string"
    ? { ok: true, message: "لینکی تایبەتت ئامادەیە.", shareCode: result.share_code }
    : { ok: false, message: "کۆدی لینکی تایبەت لە سیستەم وەرنەگیرا." };
}

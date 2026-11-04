"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPostStatusTargets, isValidPostSlug } from "@/lib/post-rules";

export type PostActionState = { status: "idle" | "success" | "error"; message: string };
const initialState: PostActionState = { status: "idle", message: "" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

async function getAdminClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null, message: "پەیوەندی بە خزمەتگوزاری بەردەست نییە." };
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role;
  if (!user || (role !== "admin" && role !== "super_admin")) {
    return { supabase: null, user: null, message: "تەنها ئەدمین و سوپەر ئەدمین دەتوانن پۆست بەڕێوەببەن." };
  }
  return { supabase, user, message: "" };
}

function databaseMessage(message: string): string {
  if (message.includes("posts_slug_key") || message.includes("duplicate key")) return "ئەم Slug ـە پێشتر بەکارهاتووە؛ Slug ـێکی تر هەڵبژێرە.";
  if (message.includes("row-level security")) return "دەسەڵاتی بەڕێوەبردنی پۆستت پشتڕاست نەکراوە.";
  return "پاشەکەوتکردنی پۆست سەرکەوتوو نەبوو؛ زانیارییەکان پشکنە.";
}

export async function savePostAction(
  _previousState: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const title = value(formData, "title");
  const slug = value(formData, "slug").toLowerCase();
  const excerpt = value(formData, "excerpt");
  const body = value(formData, "body");
  const rawCover = value(formData, "cover_image_url");
  const postId = value(formData, "post_id");

  if (title.length < 3 || title.length > 180) return { status: "error", message: "ناونیشان دەبێت لە نێوان ٣ تا ١٨٠ پیت بێت." };
  if (!isValidPostSlug(slug)) return { status: "error", message: "Slug دەبێت بە پیتی بچووک و ژمارە و هێڵی ناوەڕاست بێت." };
  if (excerpt.length < 10 || excerpt.length > 360) return { status: "error", message: "پوختە دەبێت لە نێوان ١٠ تا ٣٦٠ پیت بێت." };
  if (body.length < 20 || body.length > 30000) return { status: "error", message: "ناوەڕۆک دەبێت لە نێوان ٢٠ تا ٣٠٠٠٠ پیت بێت." };

  let coverImageUrl: string | null = null;
  if (rawCover) {
    try {
      const parsed = new URL(rawCover);
      if (parsed.protocol !== "https:") throw new Error("https required");
      coverImageUrl = parsed.toString();
    } catch {
      return { status: "error", message: "لینکی وێنە دەبێت URL ـی HTTPS ـی دروست بێت." };
    }
  }

  const auth = await getAdminClient();
  if (!auth.supabase || !auth.user) return { status: "error", message: auth.message };
  const supabase = auth.supabase;

  if (postId) {
    if (!uuidPattern.test(postId)) return { status: "error", message: "ناسنامەی پۆست دروست نییە." };
    const { error } = await supabase.from("posts").update({
      title, slug, excerpt, body, cover_image_url: coverImageUrl,
    }).eq("id", postId);
    if (error) return { status: "error", message: databaseMessage(error.message) };
  } else {
    const { error } = await supabase.from("posts").insert({
      author_user_id: auth.user.id,
      title, slug, excerpt, body, cover_image_url: coverImageUrl,
      status: "draft",
    });
    if (error) return { status: "error", message: databaseMessage(error.message) };
  }

  revalidatePath("/dashboard/posts");
  revalidatePath("/posts");
  revalidatePath(`/posts/${slug}`);
  return { status: "success", message: postId ? "پۆستەکە نوێ کرایەوە." : "پۆستەکە وەک ڕەشنووس پاشەکەوت کرا." };
}

export async function updatePostStatusAction(
  _previousState: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const postId = value(formData, "post_id");
  const newStatus = value(formData, "new_status");
  if (!uuidPattern.test(postId)) return { status: "error", message: "ناسنامەی پۆست دروست نییە." };
  if (!["draft", "published", "archived"].includes(newStatus)) return { status: "error", message: "دۆخی پۆست دروست نییە." };

  const auth = await getAdminClient();
  if (!auth.supabase) return { status: "error", message: auth.message };
  const supabase = auth.supabase;

  const { data: post, error: readError } = await supabase.from("posts")
    .select("status,slug").eq("id", postId).maybeSingle();
  if (readError || !post) return { status: "error", message: "پۆست نەدۆزرایەوە." };
  if (!getPostStatusTargets(post.status).includes(newStatus as "draft" | "published" | "archived")) {
    return { status: "error", message: "ئەم گۆڕانکارییە لە ڕێڕەوی پۆستدا ڕێگەپێدراو نییە." };
  }

  const { error } = await supabase.from("posts").update({
    status: newStatus,
    published_at: newStatus === "published" ? new Date().toISOString() : null,
  }).eq("id", postId);
  if (error) return { status: "error", message: databaseMessage(error.message) };

  revalidatePath("/dashboard/posts");
  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  return { status: "success", message: "دۆخی پۆست گۆڕدرا و لە مێژووی Audit تۆمار کرا." };
}

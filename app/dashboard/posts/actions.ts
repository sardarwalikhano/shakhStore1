"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMerchantCategoryForRole, getPostStatusTargets, isValidPostSlug } from "@/lib/post-rules";

export type PostActionState = { status: "idle" | "success" | "error"; message: string };
const initialState: PostActionState = { status: "idle", message: "" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

async function getPostActor() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null, role: null, message: "پەیوەندی بە خزمەتگوزاری بەردەست نییە." } as const;
  const { data: { user } } = await supabase.auth.getUser();
  const role = typeof user?.app_metadata?.role === "string" ? user.app_metadata.role : null;
  const isPlatformManager = role === "admin" || role === "super_admin";
  const isMerchant = getMerchantCategoryForRole(role) !== null;
  if (!user || (!isPlatformManager && !isMerchant)) {
    return { supabase: null, user: null, role: null, message: "ئەم کردارە بۆ ڕۆڵی هەژمارەکەت ڕێگەپێدراو نییە." } as const;
  }
  return { supabase, user, role, message: "" } as const;
}

async function findOwnedActiveStore(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string,
  role: string,
  storeId: string,
) {
  const category = getMerchantCategoryForRole(role);
  if (!category || !uuidPattern.test(storeId)) return null;
  const { data, error } = await supabase.from("stores")
    .select("id,name,merchant_category,status")
    .eq("id", storeId)
    .eq("owner_id", userId)
    .eq("merchant_category", category)
    .eq("is_platform_store", false)
    .eq("status", "active")
    .maybeSingle();
  return error ? null : data;
}

async function isOrderableProductForPost(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  productId: string,
  postStoreId: string | null,
  userId: string,
  role: string,
): Promise<boolean> {
  if (!uuidPattern.test(productId)) return false;
  const { data: product, error: productError } = await supabase.from("products")
    .select("id,store_id,status,is_available")
    .eq("id", productId)
    .maybeSingle();
  if (productError || !product || product.status !== "published" || !product.is_available) return false;

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id,owner_id,status,is_platform_store")
    .eq("id", product.store_id)
    .maybeSingle();
  if (storeError || !store || store.status !== "active" || store.is_platform_store) return false;
  if (postStoreId && product.store_id !== postStoreId) return false;
  if (getMerchantCategoryForRole(role) && store.owner_id !== userId) return false;
  return true;
}

function databaseMessage(message: string): string {
  if (message.includes("posts_slug_key") || message.includes("duplicate key")) return "ئەم Slug ـە پێشتر بەکارهاتووە؛ Slug ـێکی تر هەڵبژێرە.";
  if (message.includes("POST_PRODUCT_NOT_ORDERABLE") || message.includes("POST_PRODUCT_STORE_MISMATCH")) return "بەرهەمی پەیوەست دەبێت بڵاوکراوە و بەردەست بێت؛ بۆ پۆستی فرۆشگا، لە هەمان فرۆشگا بێت.";
  if (message.includes("row-level security") || message.includes("POST_AUTHOR_ROLE_REQUIRED")) return "دەسەڵاتی پۆستکردنت بۆ ئەم فرۆشگایە پشتڕاست نەکراوە.";
  return "پاشەکەوتکردنی پۆست سەرکەوتوو نەبوو؛ زانیارییەکان پشکنە.";
}

async function canManageExistingPost(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string,
  role: string,
  postId: string,
) {
  const { data: post, error } = await supabase.from("posts")
    .select("id,author_user_id,store_id,status,slug")
    .eq("id", postId)
    .maybeSingle();
  if (error || !post) return null;
  if (role === "admin" || role === "super_admin") return post;
  if (post.author_user_id !== userId || !post.store_id) return null;
  const store = await findOwnedActiveStore(supabase, userId, role, post.store_id);
  return store ? post : null;
}

export async function savePostAction(
  _previousState: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const title = value(formData, "title");
  const slug = value(formData, "slug").toLowerCase();
  const category = value(formData, "category");
  const excerpt = value(formData, "excerpt");
  const body = value(formData, "body");
  const rawCover = value(formData, "cover_image_url");
  const postId = value(formData, "post_id");
  const productId = value(formData, "product_id");
  if (productId && !uuidPattern.test(productId)) return { status: "error", message: "بەرهەمی هەڵبژێردراو دروست نییە." };

  if (title.length < 3 || title.length > 180) return { status: "error", message: "ناونیشان دەبێت لە نێوان ٣ تا ١٨٠ پیت بێت." };
  if (!isValidPostSlug(slug)) return { status: "error", message: "Slug دەبێت بە پیتی بچووک و ژمارە و هێڵی ناوەڕاست بێت." };
  if (!["general","offers","products","news","announcements","food","meat","produce","supermarket"].includes(category)) return { status: "error", message: "کاتەگۆری پۆست دروست نییە." };
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

  const auth = await getPostActor();
  if (!auth.supabase || !auth.user || !auth.role) return { status: "error", message: auth.message };
  const { supabase, user, role } = auth;
  const isPlatformManager = role === "admin" || role === "super_admin";

  if (postId) {
    if (!uuidPattern.test(postId)) return { status: "error", message: "ناسنامەی پۆست دروست نییە." };
    const existing = await canManageExistingPost(supabase, user.id, role, postId);
    if (!existing) return { status: "error", message: "تەنها دەتوانیت پۆستی خۆت یان پۆستی پلاتفۆرم دەستکاری بکەیت." };
    if (productId && !(await isOrderableProductForPost(supabase, productId, existing.store_id, user.id, role))) {
      return { status: "error", message: "بەرهەمی پەیوەست دەبێت بڵاوکراوە و بەردەست بێت؛ بۆ پۆستی فرۆشگا، بەرهەمەکە لە هەمان فرۆشگا هەڵبژێرە." };
    }
    const { error } = await supabase.from("posts").update({
      title, slug, category, excerpt, body, cover_image_url: coverImageUrl,
      product_id: productId || null,
    }).eq("id", postId);
    if (error) return { status: "error", message: databaseMessage(error.message) };
  } else {
    let storeId: string | null = null;
    if (!isPlatformManager) {
      storeId = value(formData, "store_id");
      const store = await findOwnedActiveStore(supabase, user.id, role, storeId);
      if (!store) return { status: "error", message: "فرۆشگای چالاک و هاوتای ڕۆڵەکەت نەدۆزرایەوە." };
    }
    if (productId && !(await isOrderableProductForPost(supabase, productId, storeId, user.id, role))) {
      return { status: "error", message: "بەرهەمی پەیوەست دەبێت بڵاوکراوە و بەردەست بێت؛ بۆ پۆستی فرۆشگا، بەرهەمەکە لە هەمان فرۆشگا هەڵبژێرە." };
    }
    const { error } = await supabase.from("posts").insert({
      author_user_id: user.id,
      store_id: storeId,
      title, slug, category, excerpt, body, cover_image_url: coverImageUrl,
      product_id: productId || null,
      status: "draft",
      published_at: null,
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

  const auth = await getPostActor();
  if (!auth.supabase || !auth.user || !auth.role) return { status: "error", message: auth.message };
  const post = await canManageExistingPost(auth.supabase, auth.user.id, auth.role, postId);
  if (!post) return { status: "error", message: "تەنها دەتوانیت دۆخی پۆستی خۆت بگۆڕیت." };
  if (!getPostStatusTargets(post.status).includes(newStatus as "draft" | "published" | "archived")) {
    return { status: "error", message: "ئەم گۆڕانکارییە لە ڕێڕەوی پۆستدا ڕێگەپێدراو نییە." };
  }

  const { error } = await auth.supabase.from("posts").update({
    status: newStatus,
    published_at: newStatus === "published" ? new Date().toISOString() : null,
  }).eq("id", postId);
  if (error) return { status: "error", message: databaseMessage(error.message) };

  revalidatePath("/dashboard/posts");
  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  return { status: "success", message: "دۆخی پۆست گۆڕدرا و لە مێژووی Audit تۆمار کرا." };
}

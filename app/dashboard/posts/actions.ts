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
  if (message.includes("INVALID_SHARE_REWARD_CONFIGURATION") || message.includes("INVALID_SHARE_REWARD_LIMIT")) return "بڕی خەڵات دەبێت لە ١ تا ١٠،٠٠٠،٠٠٠ دینار بێت.";
  if (message.includes("FUNDED_SHARE_REWARD_CANNOT_BE_CHANGED") || message.includes("FUNDED_SHARE_REWARD_CANNOT_BE_REMOVED")) return "بودجەی پاداشت پارێزراوە؛ دوای بڵاوکردنەوە ناتوانرێت بگۆڕدرێت یان بسڕدرێتەوە.";
  if (message.includes("SHARE_REWARD_MUST_BE_SET_BEFORE_PUBLISHING")) return "پاداشت پێویستە پێش بڵاوکردنەوەی پۆست ڕێکبخرێت.";
  if (message.includes("INVALID_SHARE_REWARD_CONFIGURATION")) return "بڕی پاداشت دەبێت لە ١٠٠ تا ١٠،٠٠٠،٠٠٠ دینار و ژمارەی پاداشتەکان لە ١ تا ١٠٠٠ بێت.";
  if (message.includes("FUNDED_SHARE_REWARD_CANNOT_BE_CHANGED") || message.includes("FUNDED_SHARE_REWARD_CANNOT_BE_REMOVED")) return "پاداشتی پارێزراو ناتوانرێت بگۆڕدرێت؛ پێویستە پێش بڵاوکردنەوە ڕێکی بخەیت.";
  if (message.includes("SHARE_REWARD_MUST_BE_SET_BEFORE_PUBLISHING")) return "پاداشت تەنها پێش بڵاوکردنەوەی پۆست دەتوانرێت ڕێکبخرێت.";
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
  const newProductName = value(formData, "new_product_name");
  const newProductPrice = value(formData, "new_product_price_iqd");
  const newProductCategory = value(formData, "new_product_category_id");
  const newProductImage = value(formData, "new_product_image_url");
  const shareRewardFieldPresent = formData.has("share_reward_amount_iqd");
  const shareRewardAmountRaw = value(formData, "share_reward_amount_iqd");
  const shareRewardAmountIqd = shareRewardFieldPresent && shareRewardAmountRaw ? Number(shareRewardAmountRaw) : 0;

  const createsProduct = Boolean(newProductName || newProductPrice || newProductCategory || newProductImage);
  if (productId && !uuidPattern.test(productId)) return { status: "error", message: "بەرهەمی هەڵبژێردراو دروست نییە." };
  if (productId && createsProduct) return { status: "error", message: "یاخود بەرهەمێکی بڵاوکراوە هەڵبژێرە، یان بەرهەمی نوێ زیاد بکە؛ هەردووکیان پێکەوە مەکە." };
  if (shareRewardFieldPresent && (!Number.isSafeInteger(shareRewardAmountIqd) || shareRewardAmountIqd < 0 || shareRewardAmountIqd > 10000000)) {
    return { status: "error", message: "بڕی خەڵات دەبێت ژمارەیەکی تەواو لە نێوان ٠ تا ١٠،٠٠٠،٠٠٠ دینار بێت." };
  }

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
  let storeId: string | null = null;

  if (postId) {
    if (!uuidPattern.test(postId)) return { status: "error", message: "ناسنامەی پۆست دروست نییە." };
    const existing = await canManageExistingPost(supabase, user.id, role, postId);
    if (!existing) return { status: "error", message: "تەنها دەتوانیت پۆستی خۆت یان پۆستی پلاتفۆرم دەستکاری بکەیت." };
    storeId = existing.store_id;
    if (createsProduct && (existing.status !== "draft" || !storeId || isPlatformManager)) {
      return { status: "error", message: "بەرهەمی نوێ تەنها لەگەڵ پۆستی ڕەشنووسی فرۆشگای خۆت دروست دەکرێت." };
    }
    if (productId && !(await isOrderableProductForPost(supabase, productId, storeId, user.id, role))) {
      return { status: "error", message: "بەرهەمی پەیوەست دەبێت بڵاوکراوە و بەردەست بێت؛ بۆ پۆستی فرۆشگا، لە هەمان فرۆشگا هەڵیبژێرە." };
    }
    const { error } = await supabase.from("posts").update({
      title, slug, category, excerpt, body, cover_image_url: coverImageUrl,
      product_id: productId || null,
    }).eq("id", postId);
    if (error) return { status: "error", message: databaseMessage(error.message) };
  } else {
    if (!isPlatformManager) {
      storeId = value(formData, "store_id");
      const store = await findOwnedActiveStore(supabase, user.id, role, storeId);
      if (!store) return { status: "error", message: "فرۆشگای چالاک و هاوتای ڕۆڵەکەت نەدۆزرایەوە." };
    }
    if (createsProduct && (!storeId || isPlatformManager)) {
      return { status: "error", message: "بەرهەمی فرۆشگا تەنها لە پۆستی دوکانداری چالاکدا زیاد دەکرێت." };
    }
    if (productId && !(await isOrderableProductForPost(supabase, productId, storeId, user.id, role))) {
      return { status: "error", message: "بەرهەمی پەیوەست دەبێت بڵاوکراوە و بەردەست بێت؛ بۆ پۆستی فرۆشگا، لە هەمان فرۆشگا هەڵیبژێرە." };
    }
    const { data: insertedPost, error } = await supabase.from("posts").insert({
      author_user_id: user.id,
      store_id: storeId,
      title, slug, category, excerpt, body, cover_image_url: coverImageUrl,
      product_id: productId || null,
      status: "draft",
      published_at: null,
    }).select("id").single();
    if (error || !insertedPost) return { status: "error", message: databaseMessage(error?.message ?? "post_insert_failed") };
    if (shareRewardFieldPresent && getMerchantCategoryForRole(role)) {
      const { error: rewardError } = await supabase.rpc("configure_post_share_reward_v1", {
        p_post_id: insertedPost.id,
        p_reward_amount_iqd: shareRewardAmountIqd,
        p_max_claims: null,
      });
      if (rewardError) return { status: "error", message: databaseMessage(rewardError.message) };
    }
    if (createsProduct) {
      const productResult = await createDraftProductForPost(supabase, role, storeId, insertedPost.id, formData);
      if (!productResult.ok) return { status: "error", message: productResult.message };
    }
  }

  if (postId && shareRewardFieldPresent && getMerchantCategoryForRole(role)) {
    const { error: rewardError } = await supabase.rpc("configure_post_share_reward_v1", {
      p_post_id: postId,
      p_reward_amount_iqd: shareRewardAmountIqd,
      p_max_claims: null,
    });
    if (rewardError) return { status: "error", message: databaseMessage(rewardError.message) };
  }

  if (postId && createsProduct) {
    const productResult = await createDraftProductForPost(supabase, role, storeId!, postId, formData);
    if (!productResult.ok) return { status: "error", message: productResult.message };
  }

  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/product-moderation");
  revalidatePath("/dashboard/share-rewards");
  revalidatePath("/posts");
  revalidatePath("/posts/" + slug);
  return {
    status: "success",
    message: createsProduct
      ? "پۆستەکە پاشەکەوت کرا و بەرهەمەکەش وەک ڕەشنووس نێردرا بۆ پشکنینی بەڕێوەبەر؛ دوای پەسەندکردنی بەرهەم دەتوانیت پۆستەکە بڵاوبکەیتەوە."
      : postId ? "پۆستەکە نوێ کرایەوە." : "پۆستەکە وەک ڕەشنووس پاشەکەوت کرا.",
  };
}

async function createDraftProductForPost(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  role: string,
  storeId: string,
  postId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const name = value(formData, "new_product_name");
  const categoryId = value(formData, "new_product_category_id");
  const priceIqd = Number(value(formData, "new_product_price_iqd"));
  const unit = value(formData, "new_product_unit");
  const stockRaw = value(formData, "new_product_stock_quantity");
  const stockQuantity = stockRaw ? Number(stockRaw) : null;
  const imageUrlRaw = value(formData, "new_product_image_url");
  const allowedUnits: Record<string, string[]> = {
    meat_seafood: ["kg","g","piece","pack"],
    fruits_vegetables: ["kg","g","piece","pack"],
    supermarket: ["piece","kg","g","liter","ml","pack","bottle","box","dozen"],
    restaurant: ["piece","kg","g","liter","ml","pack"],
  };
  const category = getMerchantCategoryForRole(role);
  if (!category || !storeId || !uuidPattern.test(categoryId)) return { ok: false, message: "پۆلی بەرهەم یان فرۆشگای پەیوەست دروست نییە." };
  if (name.length < 2 || name.length > 160) return { ok: false, message: "ناوی بەرهەم دەبێت لە نێوان ٢ تا ١٦٠ پیت بێت." };
  if (!Number.isSafeInteger(priceIqd) || priceIqd < 1) return { ok: false, message: "نرخی بەرهەم بە دیناری تەواو و زیاتر لە سفر بنووسە." };
  if (!(allowedUnits[category] ?? []).includes(unit)) return { ok: false, message: "یەکەی بەرهەم بۆ ئەم جۆرە فرۆشگایە ڕێگەپێدراو نییە." };
  if (stockQuantity !== null && (!Number.isFinite(stockQuantity) || stockQuantity < 0 || (unit !== "kg" && unit !== "liter" && !Number.isSafeInteger(stockQuantity)))) {
    return { ok: false, message: "بڕی کۆگا بۆ ئەم یەکەیە نادروستە." };
  }
  let imageUrl: string;
  try {
    const parsed = new URL(imageUrlRaw);
    if (parsed.protocol !== "https:") throw new Error("https required");
    imageUrl = parsed.toString();
  } catch {
    return { ok: false, message: "تکایە وێنەی بەرهەم بار بکە؛ لینکی وێنە دەبێت HTTPS بێت." };
  }
  const fractional = unit === "kg" || unit === "liter";
  const { data: product, error: insertError } = await supabase.from("products").insert({
    store_id: storeId,
    category_id: categoryId,
    name,
    price_iqd: priceIqd,
    image_url: imageUrl,
    unit,
    stock_quantity: stockQuantity,
    min_order_quantity: fractional ? 0.1 : 1,
    quantity_step: fractional ? 0.1 : 1,
  }).select("id").single();
  if (insertError || !product) return { ok: false, message: "زیادکردنی بەرهەم سەرکەوتوو نەبوو؛ پۆلی بەرهەم، وێنە و دەسەڵاتەکان پشکنە." };
  const { error: linkError } = await supabase.from("posts").update({ product_id: product.id }).eq("id", postId);
  if (linkError) return { ok: false, message: "بەرهەمەکە وەک ڕەشنووس زیاد کرا، بەڵام بە پۆستەکەوە نەبەسترا. پۆستەکە هێشتا ڕەشنووسە؛ تکایە دووبارە هەوڵ بدە." };
  return { ok: true };
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

  const { error } = await auth.supabase.rpc("change_post_status_with_share_reward_v1", {
    p_post_id: postId,
    p_new_status: newStatus,
  });
  if (error) {
    if (error.message.includes("SHARE_REWARD_CAMPAIGN_CLOSED")) {
      return { status: "error", message: "بودجەی پاداشتی پۆستێکی ئەرشیفکراو داخراوە؛ بۆ پاداشتی نوێ پۆستێکی نوێ دروست بکە." };
    }
    return { status: "error", message: databaseMessage(error.message) };
  }

  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard/share-rewards");
  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  return { status: "success", message: "دۆخی پۆست گۆڕدرا و لە مێژووی Audit تۆمار کرا." };
}

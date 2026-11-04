"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProductModerationTargets } from "@/lib/product-moderation";

export type ProductModerationActionState = { status: "idle" | "success" | "error"; message: string };

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function friendlyDatabaseError(message: string): string {
  if (message.includes("PRODUCT_CHANGED_REFRESH_AND_REVIEW_AGAIN")) return "زانیاری بەرهەم گۆڕاوە؛ پەڕەکە نوێ بکەرەوە و دووبارە پشکنین بکە.";
  if (message.includes("SUPER_ADMIN_REQUIRED_FOR_PLATFORM_STORE")) return "تەنها سوپەر ئەدمین دەتوانێت بەرهەمی فرۆشگای پلاتفۆرم بگۆڕێت.";
  if (message.includes("STORE_NOT_ACTIVE")) return "فرۆشگا چالاک نییە؛ بەرهەم ناتوانرێت بڵاو بکرێتەوە.";
  if (message.includes("PRODUCT_CATEGORY_NOT_ACTIVE")) return "پۆلی بەرهەم چالاک نییە؛ پێش بڵاوکردنەوە پۆلێکی چالاک هەڵبژێرە.";
  if (message.includes("PRODUCT_INCOMPLETE")) return "بەرهەم تەواو نییە؛ وێنە، نرخ، بەردەستبوون و پۆلی چالاک پشکنە.";
  if (message.includes("ARCHIVED_PRODUCT_MUST_RETURN_TO_DRAFT_FIRST")) return "بەرهەمی ئەرشیفکراو سەرەتا دەبێت بگەڕێندرێتەوە بۆ ڕەشنووس.";
  if (message.includes("ADMIN_REQUIRED") || message.includes("AUTH_REQUIRED")) return "دەستڕاگەیشتنی بەڕێوەبەر پێویستە.";
  if (message.includes("INVALID_MODERATION_REASON")) return "هۆکار دەبێت لانیکەم ٢ پیت و زۆرترین ١٢٠٠ پیت بێت.";
  return "گۆڕینی دۆخی بەرهەم سەرکەوتوو نەبوو؛ تکایە دووبارە هەوڵ بدەرەوە.";
}

export async function moderateProductStatusAction(
  _previousState: ProductModerationActionState,
  formData: FormData,
): Promise<ProductModerationActionState> {
  const productId = formText(formData, "product_id");
  const newStatus = formText(formData, "new_status");
  const reason = formText(formData, "reason");
  const expectedUpdatedAt = formText(formData, "expected_updated_at");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(productId)) return { status: "error", message: "ناسنامەی بەرهەم دروست نییە." };
  if (!["draft", "published", "archived"].includes(newStatus)) return { status: "error", message: "دۆخی داواکراو دروست نییە." };
  if (reason.length < 2 || reason.length > 1200) return { status: "error", message: "هۆکار دەبێت لانیکەم ٢ پیت و زۆرترین ١٢٠٠ پیت بێت." };
  if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) return { status: "error", message: "وەشانی زانیاری بەرهەم نەگونجاوە؛ پەڕەکە نوێ بکەرەوە." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "پەیوەندی بە خزمەتگوزاری بەردەست نییە." };

  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role;
  if (!user || (role !== "admin" && role !== "super_admin")) {
    return { status: "error", message: "دەستڕاگەیشتنی بەڕێوەبەر پێویستە." };
  }

  const { data: currentProduct, error: readError } = await supabase
    .from("products").select("status").eq("id", productId).maybeSingle();
  if (readError || !currentProduct) {
    return { status: "error", message: "بەرهەم نەدۆزرایەوە یان دەستڕاگەیشتنت پێی نییە." };
  }
  if (!getProductModerationTargets(currentProduct.status).includes(newStatus as "draft" | "published" | "archived")) {
    return { status: "error", message: "ئەم گۆڕانکارییە لە ڕێڕەوی دۆخی بەرهەمدا ڕێگەپێدراو نییە." };
  }

  const { error } = await supabase.rpc("admin_set_product_status_v1", {
    p_product_id: productId,
    p_new_status: newStatus,
    p_reason: reason,
    // Preserve the database timestamp precision from the hidden form value.
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) return { status: "error", message: friendlyDatabaseError(error.message) };

  revalidatePath("/dashboard/product-moderation");
  revalidatePath("/dashboard/products");
  revalidatePath("/search");
  return { status: "success", message: "دۆخی بەرهەم گۆڕدرا و لە تۆماری چاودێریدا تۆمار کرا." };
}

import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard-frame";
import { ProductModerationReview, type ProductModerationAuditItem, type ProductModerationItem } from "@/components/product-moderation-review";
import type { ProductStatus } from "@/lib/product-moderation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProductModerationPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roleValue = user.app_metadata?.role;
  const role = roleValue === "admin" || roleValue === "super_admin" ? roleValue : null;
  const identity = {
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
    email: user.email ?? null,
    role,
  };

  if (!role) {
    return (
      <DashboardFrame identity={identity} title="پشکنینی بەرهەم" subtitle="ئەم بەشە تەنها بۆ ئەدمین و سوپەر ئەدمینە." activePath="/dashboard/product-moderation">
        <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
      </DashboardFrame>
    );
  }

  const [productsResult, storesResult, categoriesResult, eventsResult] = await Promise.all([
    supabase.from("products").select("id,store_id,category_id,name,image_url,price_iqd,stock_quantity,min_order_quantity,max_order_quantity,quantity_step,unit,status,is_available,updated_at").order("updated_at", { ascending: false }).limit(100),
    supabase.from("stores").select("id,name,is_platform_store"),
    supabase.from("catalog_categories").select("id,name_ckb"),
    supabase.from("product_moderation_events").select("id,product_id,store_id,actor_role,previous_status,new_status,reason,created_at").order("created_at", { ascending: false }).limit(30),
  ]);

  const pageError = productsResult.error || storesResult.error || categoriesResult.error || eventsResult.error;
  const storesById = new Map((storesResult.data ?? []).map((store) => [store.id, store]));
  const categoriesById = new Map((categoriesResult.data ?? []).map((category) => [category.id, category]));
  const productsById = new Map((productsResult.data ?? []).map((product) => [product.id, product]));

  const products: ProductModerationItem[] = (productsResult.data ?? []).map((product) => {
    const store = storesById.get(product.store_id);
    return {
      id: product.id,
      name: product.name,
      imageUrl: product.image_url,
      storeName: store?.name ?? "فرۆشگای نەناسراو",
      isPlatformStore: store?.is_platform_store ?? false,
      categoryName: product.category_id ? categoriesById.get(product.category_id)?.name_ckb ?? null : null,
      priceIqd: product.price_iqd,
      stockQuantity: product.stock_quantity === null ? null : Number(product.stock_quantity),
      minOrderQuantity: product.min_order_quantity,
      maxOrderQuantity: product.max_order_quantity,
      quantityStep: product.quantity_step,
      unit: product.unit,
      status: product.status as ProductStatus,
      isAvailable: product.is_available,
      updatedAt: product.updated_at,
    };
  });

  const events: ProductModerationAuditItem[] = (eventsResult.data ?? []).map((event) => ({
    id: event.id, productName: productsById.get(event.product_id)?.name ?? "بەرهەم",
    storeName: storesById.get(event.store_id)?.name ?? "فرۆشگا",
    actorRole: event.actor_role, previousStatus: event.previous_status,
    newStatus: event.new_status, reason: event.reason, createdAt: event.created_at,
  }));

  return (
    <DashboardFrame identity={identity} title="پشکنینی بەرهەم" subtitle="وێنە، نرخ، یەکە و سنووری داواکاری پشکنین بکە." activePath="/dashboard/product-moderation">
      {pageError ? (
        <div className="empty-state"><strong>نەتوانرا داتای پشکنینی بەرهەم بخوێندرێتەوە</strong><span className="muted">دەستڕاگەیشتن و policy ـەکانی Database پشکنە.</span></div>
      ) : <ProductModerationReview products={products} events={events} />}
    </DashboardFrame>
  );
}

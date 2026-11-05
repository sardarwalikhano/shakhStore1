import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard-frame";
import { PostsManager, type OrderablePostProduct, type PostAuditRecord, type PostRecord, type PostShareRewardCampaign, type ProductCategoryOption } from "@/components/posts-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMerchantCategoryForRole } from "@/lib/post-rules";

export const dynamic = "force-dynamic";

type DashboardPostRole =
  | "admin" | "super_admin" | "restaurant" | "supermarket"
  | "produce_vendor" | "meat_seafood_vendor";

export default async function DashboardPostsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" ? rawRole : null;
  const platformManager = role === "admin" || role === "super_admin";
  const merchantCategory = getMerchantCategoryForRole(role);
  const allowed = platformManager || merchantCategory !== null;
  const dashboardRole = allowed ? role as DashboardPostRole : null;
  const identity = {
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
    email: user.email ?? null,
    role: dashboardRole,
  };

  if (!allowed) {
    return <DashboardFrame identity={identity} title="پۆست و ئاگاداری" subtitle="ئەم بەشە تەنها بۆ پلاتفۆرم و دوکاندارانی پەسەندکراوە." activePath="/dashboard/posts">
      <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
    </DashboardFrame>;
  }

  let store: { id: string; name: string; status: string; merchant_category: string } | null = null;
  let storeError: string | null = null;
  if (!platformManager && merchantCategory) {
    const { data, error } = await supabase.from("stores")
      .select("id,name,status,merchant_category")
      .eq("owner_id", user.id)
      .eq("merchant_category", merchantCategory)
      .eq("is_platform_store", false)
      .in("status", ["active","suspended"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    store = data;
    storeError = error?.message ?? null;
  }

  if (!platformManager && !store) {
    return <DashboardFrame identity={identity} title="پۆست و ئاگاداری" subtitle="بەشی پۆستەکانی فرۆشگاکەت." activePath="/dashboard/posts">
      <div className="empty-state">
        <strong>{storeError ? "نەتوانرا زانیاری فرۆشگا بخوێندرێتەوە" : "فرۆشگای چالاکی هاوتای ڕۆڵەکەت نییە"}</strong>
        <span className="muted">پۆستکردن تەنها بۆ فرۆشگای پەسەندکراو و چالاک ڕێگەپێدراوە.</span>
      </div>
    </DashboardFrame>;
  }

  let postsQuery = supabase.from("posts")
    .select("id,title,slug,category,excerpt,body,cover_image_url,status,published_at,store_id,product_id,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (!platformManager && store) postsQuery = postsQuery.eq("store_id", store.id);

  const postsResult = await postsQuery;
  const posts = (postsResult.data ?? []) as PostRecord[];
  const postIdsForRewards = posts.map((post) => post.id);
  let campaigns = new Map<string, PostShareRewardCampaign>();
  let campaignsError: string | null = null;
  if (postIdsForRewards.length > 0) {
    const campaignResult = await supabase.from("post_share_reward_campaigns")
      .select("post_id,reward_amount_iqd,max_claims,reserved_amount_iqd,paid_amount_iqd,status")
      .in("post_id", postIdsForRewards);
    if (campaignResult.error) {
      campaignsError = campaignResult.error.message;
    } else {
      campaigns = new Map((campaignResult.data ?? []).map((campaign) => [campaign.post_id, campaign as PostShareRewardCampaign]));
    }
  }
  let eventsResult;
  if (platformManager) {
    eventsResult = await supabase.from("post_audit_events")
      .select("id,post_id,title_snapshot,action,previous_status,new_status,actor_role,created_at")
      .order("created_at", { ascending: false }).limit(50);
  } else {
    const postIds = posts.map((post) => post.id);
    eventsResult = postIds.length
      ? await supabase.from("post_audit_events")
          .select("id,post_id,title_snapshot,action,previous_status,new_status,actor_role,created_at")
          .in("post_id", postIds).order("created_at", { ascending: false }).limit(50)
      : { data: [], error: null };
  }

  let orderableProducts: OrderablePostProduct[] = [];
  let productsError: string | null = null;
  let productsQuery = supabase.from("products")
    .select("id,name,store_id,price_iqd,unit,image_url,status,is_available")
    .order("name", { ascending: true })
    .limit(200);
  if (!platformManager && store) productsQuery = productsQuery.eq("store_id", store.id);
  const productsResult = await productsQuery;
  let linkedProducts = new Map<string, { id: string; name: string; price_iqd: number; unit: string; image_url: string | null; status: string }>();
  if (productsResult.error) {
    productsError = productsResult.error.message;
  } else {
    const linkedStoreIds = [...new Set((productsResult.data ?? []).map((product) => product.store_id))];
    const linkedStores = linkedStoreIds.length
      ? await supabase.from("stores").select("id,name,status,is_platform_store").in("id", linkedStoreIds)
      : { data: [], error: null };
    if (linkedStores.error) productsError = linkedStores.error.message;
    else {
      const storeMap = new Map((linkedStores.data ?? [])
        .filter((linkedStore) => linkedStore.status === "active" && !linkedStore.is_platform_store)
        .map((linkedStore) => [linkedStore.id, linkedStore.name]));
      const allProducts = (productsResult.data ?? []).flatMap((product) => {
        const storeName = storeMap.get(product.store_id);
        return storeName ? [{
          id: product.id, name: product.name, store_name: storeName,
          price_iqd: product.price_iqd, unit: product.unit,
          image_url: product.image_url, status: product.status,
          is_available: product.is_available,
        }] : [];
      });
      linkedProducts = new Map(allProducts.map((product) => [product.id, product]));
      orderableProducts = allProducts
        .filter((product) => product.status === "published" && product.is_available)
        .map(({ is_available: _available, ...product }) => product);
    }
  }

  const productCategoriesResult = await supabase.from("catalog_categories")
    .select("id,name_ckb")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const productCategories = (productCategoriesResult.data ?? []) as ProductCategoryOption[];
  const postsWithRewards = posts.map((post) => ({
    ...post,
    share_reward: campaigns.get(post.id) ?? null,
    linked_product: post.product_id ? linkedProducts.get(post.product_id) ?? null : null,
  }));



  const pageError = postsResult.error || eventsResult.error || productsError || campaignsError || productCategoriesResult.error;
  const events = (eventsResult.data ?? []) as PostAuditRecord[];

  return (
    <DashboardFrame
      identity={identity}
      title="پۆست و ئاگاداری"
      subtitle={platformManager
        ? "پۆستی پلاتفۆرم؛ هەموویان بە ناوی شاخ ستور بڵاودەبنەوە."
        : `پۆستی تایبەت بە فرۆشگای ${store?.name ?? ""}; بەشداریکردن لە پۆستەکانی فرۆشگای تر ڕێگەپێدراو نییە.`}
      activePath="/dashboard/posts"
    >
      {pageError
        ? <div className="empty-state"><strong>نەتوانرا پۆستەکان بخوێندرێنەوە</strong><span className="muted">RLS و دەستڕاگەیشتنی Database پشکنە.</span></div>
        : <PostsManager
            posts={postsWithRewards}
            events={events}
            orderableProducts={orderableProducts}
            productCategories={productCategories}
            mode={platformManager ? "platform" : "merchant"}
            storeId={store?.id ?? null}
            storeName={store?.name ?? null}
            storeCategory={store?.merchant_category ?? null}
          />}
    </DashboardFrame>
  );
}

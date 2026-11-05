import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText, ShoppingBag } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUnitLabelCkb } from "@/lib/marketplace-rules";
import { PostShareRewardClaim } from "@/components/post-share-reward-claim";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export default async function PublicPostDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const [{ data: post, error }, { data: { user } }] = await Promise.all([
    supabase.from("posts")
      .select("id,title,slug,excerpt,body,category,cover_image_url,published_at,store_id,product_id,author_user_id")
      .eq("slug", slug)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (error || !post) notFound();

  let publisher = "شاخ ستور";
  let publisherOwnerId: string | null = null;
  if (post.store_id) {
    const { data: store } = await supabase.from("stores")
      .select("id,name,owner_id").eq("id", post.store_id).maybeSingle();
    publisher = store?.name ?? "فرۆشگا";
    publisherOwnerId = store?.owner_id ?? null;
  }

  const [{ data: shareReward }, { data: existingShareClaim }] = await Promise.all([
    supabase.from("post_share_rewards_public")
      .select("reward_amount_iqd,max_claims,remaining_claims")
      .eq("post_id", post.id)
      .maybeSingle(),
    user?.app_metadata?.role === "customer"
      ? supabase.from("post_share_reward_claims")
          .select("status,review_note")
          .eq("post_id", post.id)
          .eq("customer_user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  let orderProduct: {
    id: string; name: string; description: string | null; price_iqd: number;
    image_url: string | null; unit: string; stock_quantity: number | null;
    min_order_quantity: number; max_order_quantity: number | null; quantity_step: number;
    store_id: string; store_name: string; store_slug: string; store_owner_id: string | null;
  } | null = null;

  if (post.product_id) {
    const { data: product } = await supabase.from("products")
      .select("id,name,description,price_iqd,image_url,unit,stock_quantity,min_order_quantity,max_order_quantity,quantity_step,store_id")
      .eq("id", post.product_id).eq("status", "published").eq("is_available", true).maybeSingle();
    if (product) {
      const { data: store } = await supabase.from("stores")
        .select("id,name,slug,owner_id,status,is_platform_store")
        .eq("id", product.store_id).eq("status", "active").eq("is_platform_store", false).maybeSingle();
      if (store) orderProduct = { ...product, store_name: store.name, store_slug: store.slug, store_owner_id: store.owner_id };
    }
  }

  const isOwnPost = Boolean(user && (
    user.id === post.author_user_id
    || (publisherOwnerId && user.id === publisherOwnerId)
    || (orderProduct && user.id === orderProduct.store_owner_id)
  ));
  const isCustomer = user?.app_metadata?.role === "customer";

  return (
    <>
      <SiteHeader />
      <main className="container section public-post-detail">
        <Link href="/posts" className="auth-back"><ArrowRight size={17} /> گەڕانەوە بۆ پۆستەکان</Link>
        <article className="post-article">
          <span className="eyebrow"><FileText size={15} /> {publisher}</span>
          <h1>{post.title}</h1>
          {post.published_at && <time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString("ckb-IQ", { dateStyle: "long" })}</time>}
          {post.cover_image_url && <img src={post.cover_image_url} alt={post.title} className="post-article-cover" />}
          <p className="post-article-excerpt">{post.excerpt}</p>
          <div className="post-article-body">{post.body}</div>

          {shareReward && shareReward.reward_amount_iqd !== null && shareReward.remaining_claims !== null && (
            <section className="post-share-reward-card">
              {isOwnPost ? (
                <>
                  <span className="eyebrow">SHARE & EARN</span>
                  <strong>ئەم پاداشتە بۆ کڕیارانی ترە؛ خاوەنی پۆست ناتوانێت پاداشت وەربگرێت.</strong>
                  <strong className="post-share-reward-amount">{shareReward.reward_amount_iqd.toLocaleString("en-US")} دینار</strong>
                </>
              ) : isCustomer ? (
                <PostShareRewardClaim
                  postId={post.id}
                  rewardAmountIqd={shareReward.reward_amount_iqd}
                  remainingClaims={shareReward.remaining_claims ?? 0}
                  existingClaim={existingShareClaim ?? null}
                />
              ) : user ? (
                <div>
                  <span className="eyebrow">SHARE & EARN</span>
                  <h2>پاداشتی هاوبەشکردن</h2>
                  <strong className="post-share-reward-amount">{shareReward.reward_amount_iqd.toLocaleString("en-US")} دینار</strong>
                  <p className="muted">بۆ داوای پاداشت، دەبێت بە هەژماری کڕیار بچیتە ژوورەوە.</p>
                </div>
              ) : (
                <div>
                  <span className="eyebrow">SHARE & EARN</span>
                  <h2>بە هاوبەشکردنی ئەم پۆستە پاداشت وەربگرە</h2>
                  <strong className="post-share-reward-amount">{shareReward.reward_amount_iqd.toLocaleString("en-US")} دینار</strong>
                  <Link href="/login" className="button">چوونەژوورەوە و داوای پاداشت</Link>
                </div>
              )}
            </section>
          )}

          {post.product_id && !orderProduct && (
            <section className="post-order-card">
              <strong>بەرهەمی پەیوەست بە پۆستەکە ئێستا بەردەست نییە.</strong>
              <span className="muted">خاوەنی فرۆشگا دەبێت دۆخی بەرهەم و کۆگاکەی پشکنێت.</span>
            </section>
          )}

          {orderProduct && (
            <section className="post-order-card">
              <div className="post-order-product">
                {orderProduct.image_url
                  ? <img src={orderProduct.image_url} alt={orderProduct.name} loading="lazy" />
                  : <span className="post-order-product-placeholder"><ShoppingBag size={24} /></span>}
                <div>
                  <span className="eyebrow">{orderProduct.store_name}</span>
                  <h2>{orderProduct.name}</h2>
                  {orderProduct.description && <p className="muted">{orderProduct.description}</p>}
                  <strong>{orderProduct.price_iqd.toLocaleString("en-US")} دینار / {getUnitLabelCkb(orderProduct.unit)}</strong>
                  <small className="muted">
                    کەمترین بڕ: {orderProduct.min_order_quantity} {getUnitLabelCkb(orderProduct.unit)}
                    {orderProduct.max_order_quantity !== null ? " · زۆرترین بڕ: " + orderProduct.max_order_quantity : ""}
                  </small>
                  <Link href={"/stores/" + orderProduct.store_slug} className="text-link">بینینی فرۆشگا</Link>
                </div>
              </div>
              <div className="post-order-actions">
                {isOwnPost ? (
                  <p className="form-error" role="status">ناتوانیت پۆست یان بەرهەمی خۆت داوا بکەیت.</p>
                ) : isCustomer ? (
                  <AddToCartButton product={{
                    productId: orderProduct.id, storeId: orderProduct.store_id,
                    storeSlug: orderProduct.store_slug, storeName: orderProduct.store_name,
                    productName: orderProduct.name, imageUrl: orderProduct.image_url,
                    unit: orderProduct.unit, unitPriceIqd: orderProduct.price_iqd,
                    stockQuantity: orderProduct.stock_quantity,
                    minOrderQuantity: orderProduct.min_order_quantity,
                    maxOrderQuantity: orderProduct.max_order_quantity,
                    quantityStep: orderProduct.quantity_step,
                  }} />
                ) : user ? (
                  <p className="muted">بۆ داواکاری، دەبێت بە هەژماری کڕیار چووبیتە ژوورەوە.</p>
                ) : (
                  <Link href="/login" className="button"><ShoppingBag size={17} /> چوونەژوورەوە و داواکردن</Link>
                )}
              </div>
            </section>
          )}
        </article>
      </main>
    </>
  );
}

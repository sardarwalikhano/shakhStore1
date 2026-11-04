import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Store } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUnitLabelCkb } from "@/lib/marketplace-rules";

export const dynamic = "force-dynamic";

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="container section"><div className="empty-state">ڕێکخستنی داتابەیس پێویستە.</div></main>;

  const { data: store, error } = await supabase.from("stores")
    .select("id, name, slug, merchant_category, description, city, district")
    .eq("slug", slug).eq("status", "active").eq("is_platform_store", false).maybeSingle();
  if (error || !store) notFound();

  const { data: products } = await supabase.from("products")
    .select("id, name, description, image_url, price_iqd, compare_at_price_iqd, unit, stock_quantity, min_order_quantity, max_order_quantity, quantity_step, status, is_available")
    .eq("store_id", store.id).eq("status", "published").eq("is_available", true)
    .order("name").limit(40);

  return (
    <>
      <SiteHeader />
      <main className="container section">
        <Link href="/search" className="text-link"><ArrowRight size={17} /> گەڕانەوە بۆ فرۆشگاکان</Link>
        <section className="store-detail-hero">
          <div className="store-detail-icon"><Store size={38} /></div>
          <div><h1>{store.name}</h1><p>{store.description || "زانیاری زیاتر لەسەر ئەم فرۆشگایە بەردەست دەبێت."}</p><span className="muted">{[store.city, store.district].filter(Boolean).join("، ")}</span></div>
        </section>
        <div className="section-heading"><div><h2>بەرهەمەکان</h2><p>نرخ، وێنە و بڕی داواکاری بۆ هەر بەرهەمێک دیارە.</p></div><Link href="/cart" className="text-link">بینینی سەبەتە <ArrowRight size={16} /></Link></div>
        {!products || products.length === 0 ? (
          <div className="empty-state"><strong>بەرهەمێکی بڵاوکراوە نییە</strong><span className="muted">ئەم فرۆشگایە هێشتا بەرهەمی بڵاونەکردووەتەوە.</span></div>
        ) : (
          <div className="product-grid">
            {products.map(product => (
              <article className="product-card" key={product.id}>
                <div className="product-art">
                  {product.image_url
                    ? <img src={product.image_url} alt={product.name} loading="lazy" />
                    : <Store size={26} />}
                </div>
                <div className="product-card-details">
                  <h3>{product.name}</h3>
                  <p>{product.description || " "}</p>
                  <div className="product-price-row">
                    <strong>{product.price_iqd.toLocaleString("en-US")} دینار <small>/ {getUnitLabelCkb(product.unit)}</small></strong>
                    {product.compare_at_price_iqd !== null
                      ? <del>{product.compare_at_price_iqd.toLocaleString("en-US")} دینار</del>
                      : null}
                  </div>
                  <small className="muted">
                    کەمترین داواکاری: {product.min_order_quantity} {getUnitLabelCkb(product.unit)}
                    {product.max_order_quantity !== null ? " · زۆرترین: " + product.max_order_quantity : ""}
                  </small>
                  {product.stock_quantity !== null
                    ? <small className="muted">لە کۆگا: {Number(product.stock_quantity).toLocaleString("en-US")} {getUnitLabelCkb(product.unit)}</small>
                    : null}
                </div>
                <AddToCartButton product={{
                  productId: product.id,
                  storeId: store.id,
                  storeSlug: store.slug,
                  storeName: store.name,
                  productName: product.name,
                  imageUrl: product.image_url,
                  unit: product.unit,
                  unitPriceIqd: product.price_iqd,
                  stockQuantity: product.stock_quantity === null ? null : Number(product.stock_quantity),
                  minOrderQuantity: product.min_order_quantity,
                  maxOrderQuantity: product.max_order_quantity,
                  quantityStep: product.quantity_step,
                }} />
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

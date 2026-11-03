import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Store } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    .select("id, name, description, price_iqd, unit, stock_quantity, is_available")
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
        <div className="section-heading"><div><h2>بەرهەمەکان</h2><p>تەنها بەرهەمە بڵاوکراوە و بەردەستەکان پیشان دەدرێن.</p></div></div>
        {!products || products.length === 0 ? (
          <div className="empty-state"><strong>بەرهەمێکی بڵاوکراوە نییە</strong><span className="muted">ئەم فرۆشگایە هێشتا بەرهەمی بڵاونەکردووەتەوە.</span></div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-art"><Store size={26} /></div>
                <div><h3>{product.name}</h3><p>{product.description || " "}</p><strong>{product.price_iqd.toLocaleString("en-US")} دینار <small>/ {product.unit}</small></strong></div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
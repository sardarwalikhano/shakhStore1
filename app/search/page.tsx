import Link from "next/link";
import { ArrowLeft, Search, Store } from "lucide-react";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { SiteHeader } from "@/components/site-header";
import { StoreCard } from "@/components/store-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { getUnitLabelCkb } from "@/lib/marketplace-rules";

type StoreCardData = Pick<
  Tables<"stores">,
  "id" | "name" | "slug" | "merchant_category" | "description" | "city" | "district"
>;
type ProductSearchData = Pick<
  Tables<"products">,
  "id" | "store_id" | "name" | "description" | "image_url" | "price_iqd" | "compare_at_price_iqd" | "unit" | "stock_quantity" | "min_order_quantity" | "max_order_quantity" | "quantity_step"
>;

const categoryMap: Record<string, string> = {
  restaurant: "restaurant",
  supermarket: "supermarket",
  fruits_vegetables: "fruits_vegetables",
  meat_seafood: "meat_seafood",
};

const categoryLabels: Record<string, string> = {
  restaurant: "چێشتخانە",
  supermarket: "سوپەرمارکێت",
  fruits_vegetables: "سەوزە و میوە",
  meat_seafood: "گۆشت و سپیاتی",
};

function money(value: number) {
  return value.toLocaleString("en-US") + " دینار";
}

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const category = params.category ?? "";
  const pattern = "%" + q.replace(/[%_]/g, "") + "%";
  const supabase = await createSupabaseServerClient();

  let stores: StoreCardData[] = [];
  let products: Array<{ product: ProductSearchData; store: StoreCardData }> = [];
  let configured = Boolean(supabase);

  if (supabase) {
    let storeQuery = supabase.from("stores")
      .select("id,name,slug,merchant_category,description,city,district")
      .eq("status", "active")
      .eq("is_platform_store", false)
      .order("name")
      .limit(30);
    if (q) storeQuery = storeQuery.ilike("name", pattern);
    if (categoryMap[category]) storeQuery = storeQuery.eq("merchant_category", categoryMap[category]);

    const { data: storeData, error: storeError } = await storeQuery;
    if (storeError) {
      configured = false;
    } else {
      stores = storeData ?? [];
    }

    if (q) {
      const { data: productData, error: productError } = await supabase.from("products")
        .select("id,store_id,name,description,image_url,price_iqd,compare_at_price_iqd,unit,stock_quantity,min_order_quantity,max_order_quantity,quantity_step")
        .eq("status", "published")
        .eq("is_available", true)
        .ilike("name", pattern)
        .order("name")
        .limit(40);

      if (productError) {
        configured = false;
      } else if (productData && productData.length > 0) {
        const storeIds = [...new Set(productData.map((product) => product.store_id))];
        const { data: linkedStores, error: linkedStoreError } = await supabase.from("stores")
          .select("id,name,slug,merchant_category,description,city,district")
          .in("id", storeIds)
          .eq("status", "active")
          .eq("is_platform_store", false);

        if (linkedStoreError) {
          configured = false;
        } else {
          const storeById = new Map((linkedStores ?? []).map((store) => [store.id, store]));
          products = productData
            .filter((product) => {
              const linkedStore = storeById.get(product.store_id);
              return Boolean(linkedStore)
                && (!categoryMap[category] || linkedStore?.merchant_category === categoryMap[category]);
            })
            .map((product) => ({
              product,
              store: storeById.get(product.store_id) as StoreCardData,
            }));
        }
      }
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="container section search-page">
        <div className="search-results-header">
          <div>
            <span className="eyebrow search-eyebrow"><Search size={15} /> بازاڕی شاخ ستور</span>
            <h1>گەڕان لە فرۆشگا و بەرهەمەکان</h1>
            <p className="muted">بە ناوی فرۆشگا یان بەرهەم بگەڕێ و جۆری فرۆشگاش دیاری بکە.</p>
          </div>
          <form action="/search" className="search-query-form">
            <input name="q" defaultValue={q} placeholder="ناوی بەرهەم یان فرۆشگا..." aria-label="ناوی بەرهەم یان فرۆشگا" />
            <select name="category" defaultValue={category} aria-label="جۆری فرۆشگا">
              <option value="">هەموو جۆرەکان</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
            <button className="button" type="submit"><Search size={17} /> گەڕان</button>
          </form>
        </div>

        {!configured ? (
          <div className="empty-state"><strong>پەیوەندی بە داتابەیس نییە</strong><span className="muted">ڕێکخستنی Supabase و دەستڕاگەیشتنەکان پشکنە.</span></div>
        ) : (
          <>
            {stores.length > 0 && (
              <section className="search-result-section">
                <div className="section-heading">
                  <div><h2>فرۆشگاکان</h2><p>{stores.length.toLocaleString("en-US")} فرۆشگای گونجاو دۆزرایەوە.</p></div>
                </div>
                <div className="store-grid">{stores.map((store) => <StoreCard key={store.id} store={store} />)}</div>
              </section>
            )}

            {products.length > 0 && (
              <section className="search-result-section">
                <div className="section-heading">
                  <div><h2>بەرهەمەکان</h2><p>{products.length.toLocaleString("en-US")} بەرهەمی بڵاوکراوە دۆزرایەوە.</p></div>
                </div>
                <div className="product-grid">
                  {products.map(({ product, store }) => (
                    <article className="product-card search-product-card" key={product.id}>
                      <div className="product-art">{product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" /> : <Store size={26} />}</div>
                      <div className="search-product-meta">
                        <Link href={"/stores/" + store.slug}>{store.name}</Link>
                        {store.merchant_category && <span className="category-pill">{categoryLabels[store.merchant_category] ?? "فرۆشگا"}</span>}
                      </div>
                      <div>
                        <h3>{product.name}</h3>
                        <p>{product.description || " "}</p>
                        <strong>{money(product.price_iqd)} <small>/ {getUnitLabelCkb(product.unit)}</small></strong>{product.compare_at_price_iqd !== null ? <del>{money(product.compare_at_price_iqd)}</del> : null}<small className="muted">کەمترین داواکاری: {product.min_order_quantity} {getUnitLabelCkb(product.unit)}{product.max_order_quantity !== null ? " · زۆرترین: " + product.max_order_quantity : ""}</small>
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
              </section>
            )}

            {stores.length === 0 && products.length === 0 && (
              <div className="empty-state">
                <Store size={32} color="#d96b24" />
                <strong>{q ? "هیچ ئەنجامێک نەدۆزرایەوە" : "هێشتا فرۆشگای چالاک نییە"}</strong>
                <span className="muted">{q ? "وشەی گەڕان یان جۆری فرۆشگا بگۆڕە و دووبارە هەوڵ بدە." : "کاتێک فرۆشگایەک پەسەند و چالاک بکرێت، لێرە دەردەکەوێت."}</span>
                {q && <Link href="/search" className="text-link">پاککردنەوەی گەڕان <ArrowLeft size={16} /></Link>}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

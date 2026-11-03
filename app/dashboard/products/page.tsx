import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, PackagePlus, Store } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProductCreateForm } from "./product-form";

const allowedRoles = ["restaurant", "supermarket", "produce_vendor", "meat_seafood_vendor"];

export const dynamic = "force-dynamic";

export default async function ProductsDashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const role = user.app_metadata?.role;
  if (typeof role !== "string" || !allowedRoles.includes(role)) {
    return <main className="container section"><div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong><Link href="/dashboard" className="text-link">گەڕانەوە بۆ داشبۆرد</Link></div></main>;
  }

  const { data: stores, error: storeError } = await supabase.from("stores")
    .select("id, name, slug, merchant_category, status")
    .eq("owner_id", user.id).eq("is_platform_store", false)
    .order("created_at", { ascending: false }).limit(5);
  const store = stores?.[0] ?? null;
  const productsResult = store
    ? await supabase.from("products").select("id, name, price_iqd, stock_quantity, unit, status, is_available")
        .eq("store_id", store.id).order("created_at", { ascending: false }).limit(100)
    : null;
  const products = productsResult?.data ?? [];

  return (
    <main className="container section">
      <Link href="/dashboard" className="text-link"><ArrowRight size={17} /> گەڕانەوە بۆ داشبۆرد</Link>
      <div className="section-heading" style={{ marginTop: 22 }}><div><h1>بەڕێوەبردنی بەرهەمەکان</h1><p>بەرهەمەکانی فرۆشگای خۆت بە پێی دەسەڵاتی Supabase بەڕێوەببە.</p></div></div>
      {storeError ? (
        <div className="empty-state"><strong>نەتوانرا زانیاری فرۆشگا بخوێندرێتەوە</strong></div>
      ) : !store ? (
        <div className="empty-state"><Store size={30} color="#f36b18" /><strong>فرۆشگای پەسەندکراوت نییە</strong><span className="muted">پێش زیادکردنی بەرهەم، داواکاری دوکانداری بنێرە و چاوەڕێی پەسەندکردن بکە.</span><Link href="/merchant/apply" className="button" style={{ marginTop: 14 }}>داواکاری دوکانداری</Link></div>
      ) : store.status !== "active" ? (
        <div className="empty-state"><strong>فرۆشگاکەت هێشتا چالاک نییە</strong><span className="muted">دۆخی ئێستا: {store.status}. توانای بڵاوکردنەوەی بەرهەم تا چالاککردن ناچالاکە.</span></div>
      ) : (
        <>
          <section className="dashboard-welcome"><span className="role-badge">{store.status}</span><h2>{store.name}</h2><p>بەرهەمەکانت بۆ ئەم فرۆشگایە زیاد بکە.</p></section>
          <ProductCreateForm storeId={store.id} />
          {productsResult?.error ? (
            <div className="empty-state"><strong>هەڵە لە خوێندنەوەی بەرهەمەکان</strong></div>
          ) : products.length === 0 ? (
            <div className="empty-state"><PackagePlus size={28} color="#f36b18" /><strong>هێشتا بەرهەمێک زیاد نەکراوە</strong></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>ناوی بەرهەم</th><th>نرخ</th><th>کۆگا</th><th>دۆخ</th><th>بڵاوکراوەتەوە؟</th></tr></thead>
                <tbody>{products.map((product) => (
                  <tr key={product.id}><td>{product.name}</td><td>{product.price_iqd.toLocaleString("en-US")} دینار</td><td>{product.stock_quantity ?? "—"} {product.unit}</td><td>{product.status}</td><td>{product.is_available ? "بەردەست" : "ناچالاک"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
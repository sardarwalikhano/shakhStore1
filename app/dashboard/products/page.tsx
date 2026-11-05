import { redirect } from "next/navigation";
import { PackagePlus, Store } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProductCreateForm } from "./product-form";
import { getUnitLabelCkb } from "@/lib/marketplace-rules";

const allowedRoles = ["restaurant", "supermarket", "produce_vendor", "meat_seafood_vendor"] as const;
type MerchantRole = typeof allowedRoles[number];
type Props = { searchParams: Promise<{ store_id?: string }> };

export const dynamic = "force-dynamic";

export default async function ProductsDashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedStoreId = typeof params.store_id === "string" ? params.store_id : "";
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role: MerchantRole | "super_admin" | null = rawRole === "super_admin"
    ? "super_admin"
    : typeof rawRole === "string" && allowedRoles.includes(rawRole as MerchantRole)
      ? rawRole as MerchantRole
      : null;
  const identity = {
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
    email: user.email ?? null,
    role,
  };

  if (!role) {
    return (
      <DashboardFrame identity={{ ...identity, role: null }} title="بەڕێوەبردنی بەرهەمەکان" subtitle="ئەم بەشە تەنها بۆ دوکاندارانی پەسەندکراو و سوپەر ئەدمینە." activePath="/dashboard/products">
        <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
      </DashboardFrame>
    );
  }

  const storeQuery = role === "super_admin"
    ? supabase.from("stores").select("id,name,slug,merchant_category,status").eq("is_platform_store", false).eq("status", "active").order("name", { ascending: true })
    : supabase.from("stores").select("id,name,slug,merchant_category,status").eq("owner_id", user.id).eq("is_platform_store", false).eq("status", "active").order("created_at", { ascending: false });
  const [storeResult, categoriesResult] = await Promise.all([
    storeQuery,
    supabase.from("catalog_categories").select("id,name_ckb").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);
  const stores = storeResult.data ?? [];
  const store = role === "super_admin" ? stores.find((candidate) => candidate.id === requestedStoreId) ?? null : stores[0] ?? null;
  const productsResult = store
    ? await supabase.from("products").select("id,name,image_url,price_iqd,stock_quantity,unit,min_order_quantity,max_order_quantity,quantity_step,status,is_available").eq("store_id", store.id).order("created_at", { ascending: false }).limit(100)
    : null;
  const products = productsResult?.data ?? [];
  const categories = categoriesResult.data ?? [];

  return (
    <DashboardFrame identity={identity} title="بەڕێوەبردنی بەرهەمەکان"
      subtitle={role === "super_admin" ? "فرۆشگای چالاک هەڵبژێرە؛ بەرهەمەکە لە خاوەنی ئەو فرۆشگایەوە داواکاری وەردەگرێت." : "بەرهەمەکانی فرۆشگای خۆت بە پێی دەسەڵاتی Supabase بەڕێوەببە."}
      activePath="/dashboard/products">
      {storeResult.error ? <div className="empty-state"><strong>نەتوانرا زانیاری فرۆشگا بخوێندرێتەوە</strong></div> : null}
      {!storeResult.error && role === "super_admin" && (
        <section className="dashboard-panel">
          <div className="section-heading"><div><h2>هەڵبژاردنی فرۆشگا</h2><p>بەرهەمی نوێ بۆ فرۆشگای چالاک دروست بکە، نەک بۆ فرۆشگای پلاتفۆرم.</p></div></div>
          {stores.length === 0 ? <div className="empty-state"><Store size={28} /><strong>هیچ فرۆشگای چالاکی دەرەوەی پلاتفۆرم نییە</strong></div> : (
            <form action="/dashboard/products" method="get" className="dashboard-filter-bar">
              <label><span>فرۆشگا</span><select name="store_id" defaultValue={store?.id ?? ""} required>
                <option value="" disabled>فرۆشگا هەڵبژێرە</option>
                {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              <button className="button" type="submit">هەڵبژاردنی فرۆشگا</button>
            </form>
          )}
        </section>
      )}
      {!store ? (
        <div className="empty-state"><Store size={30} color="#d96b24" />
          <strong>{role === "super_admin" ? "فرۆشگایەک هەڵبژێرە" : "فرۆشگای پەسەندکراو و چالاکت نییە"}</strong>
          <span className="muted">{role === "super_admin" ? "دوای هەڵبژاردنی فرۆشگا، دەتوانیت بەرهەمێکی نرخ‌دار و داواکاری‌پەذیر بۆی زیاد بکەیت." : "پێش زیادکردنی بەرهەم، داواکاری دوکانداری بنێرە و چاوەڕێی چالاککردنی فرۆشگاکەت بکە."}</span>
        </div>
      ) : categoriesResult.error ? <div className="empty-state"><strong>نەتوانرا پۆلەکانی بەرهەم بخوێندرێنەوە</strong></div> : (
        <>
          <section className="dashboard-welcome"><span className="role-badge">چالاک</span><h2>{store.name}</h2>
            <p>وێنە، نرخ، بڕی کۆگا و سنووری داواکاری بۆ هەر بەرهەمێک دیاری بکە.</p>
            {role === "super_admin" && <p className="muted">داواکارییەکان بۆ خاوەنی فرۆشگا دەنێردرێن؛ بەرهەمی فرۆشگای پلاتفۆرم لەم ڕێڕەوەدا داواکاری وەرناگرێت.</p>}
          </section>
          {categories.length === 0 ? <div className="empty-state"><strong>هیچ پۆلێکی چالاک نییە</strong></div> : <ProductCreateForm storeId={store.id} storeCategory={store.merchant_category ?? "supermarket"} categories={categories} />}
          {productsResult?.error ? <div className="empty-state"><strong>هەڵە لە خوێندنەوەی بەرهەمەکان</strong></div> : products.length === 0 ? (
            <div className="empty-state"><PackagePlus size={28} color="#d96b24" /><strong>هێشتا بەرهەمێک زیاد نەکراوە</strong><span className="muted">بەرهەمەکان دوای پشکنینی بەڕێوەبەر دەبنە بەردەست بۆ داواکاری.</span></div>
          ) : (
            <div className="table-wrap"><table className="data-table product-admin-table">
              <thead><tr><th>وێنە</th><th>ناوی بەرهەم</th><th>نرخ بۆ یەکە</th><th>کۆگا</th><th>سنووری داواکاری</th><th>دۆخ</th><th>بەردەست</th></tr></thead>
              <tbody>{products.map((product) => <tr key={product.id}>
                <td>{product.image_url ? <img className="product-table-thumb" src={product.image_url} alt={product.name} loading="lazy" /> : "—"}</td>
                <td>{product.name}</td><td>{product.price_iqd.toLocaleString("en-US")} دینار / {getUnitLabelCkb(product.unit)}</td>
                <td>{product.stock_quantity === null ? "—" : Number(product.stock_quantity).toLocaleString("en-US")} {getUnitLabelCkb(product.unit)}</td>
                <td>{product.min_order_quantity} {getUnitLabelCkb(product.unit)}{product.max_order_quantity !== null ? " تا " + product.max_order_quantity : ""}</td>
                <td>{product.status === "published" ? "بڵاوکراوە" : product.status === "draft" ? "ڕەشنووس" : "ئەرشیف"}</td><td>{product.is_available ? "بەڵێ" : "نەخێر"}</td>
              </tr>)}</tbody>
            </table></div>
          )}
        </>
      )}
    </DashboardFrame>
  );
}

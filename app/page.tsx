import Link from "next/link";
import { ArrowLeft, Apple, Beef, CookingPot, Gift, ShoppingBasket, Sparkles, Utensils } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { StoreCard } from "@/components/store-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

const categories = [
  { slug: "restaurant", label: "چێشتخانە", description: "خواردنی گەرم و ئامادە", icon: CookingPot },
  { slug: "supermarket", label: "سوپەرمارکێت", description: "پێداویستییە ڕۆژانەکان", icon: ShoppingBasket },
  { slug: "meat_seafood", label: "گۆشت و سپیاتی", description: "گۆشتی تازە و ماسی", icon: Beef },
  { slug: "fruits_vegetables", label: "سەوزە و میوە", description: "بەرهەمی تازە", icon: Apple },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  let stores: Tables<"stores">[] = [];
  let configured = Boolean(supabase);

  if (supabase) {
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, slug, merchant_category, description, city, district")
      .eq("status", "active")
      .eq("is_platform_store", false)
      .order("created_at", { ascending: false })
      .limit(8);
    if (!error && data) stores = data;
    if (error) configured = false;
  }

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero-section">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow"><Sparkles size={16} /> شاخ ستور، بازاڕی تۆ لە یەک شوێن</span>
              <h1>هەموو پێداویستییەکانت، <em>بە ئاسانی</em> بگەیەنە ماڵەوە</h1>
              <p>لە چێشتخانە و سوپەرمارکێت تا گۆشت و سەوزەی تازە؛ بە ئاسانی بگەڕێ، هەڵبژێرە و داواکارییەکەت تۆمار بکە.</p>
              <div className="hero-actions">
                <Link href="/search" className="button">دەستپێکردنی گەڕان <ArrowLeft size={18} /></Link>
                <Link href="/signup" className="button button-secondary">دروستکردنی هەژمار</Link>
              </div>
              <div className="hero-trust"><span /> بە زمانی کوردی، بۆ شار و ناوچەکانی کوردستان</div>
            </div>
            <div className="hero-visual" aria-label="وێنەیەکی هونەری بۆ خواردن و پێداویستییەکان">
              <div className="hero-glow" />
              <div className="hero-bag"><ShoppingBasket size={92} strokeWidth={1.25} /></div>
              <div className="floating-tile tile-one"><Utensils size={25} /><span>چێشتخانە</span></div>
              <div className="floating-tile tile-two"><Apple size={25} /><span>بەرهەمی تازە</span></div>
              <div className="floating-tile tile-three"><Beef size={25} /><span>گۆشت و سپیاتی</span></div>
              <span className="hero-sun" />
            </div>
          </div>
        </section>

        <section className="container section categories-section">
          <div className="section-heading">
            <div><h2>بەشە سەرەکییەکان</h2><p>بەشی دڵخوازت هەڵبژێرە و بەرهەمەکان ببینە</p></div>
            <Link href="/search" className="text-link">هەموو بەشەکان <ArrowLeft size={16} /></Link>
          </div>
          <div className="category-grid">
            {categories.map(({ slug, label, description, icon: Icon }) => (
              <Link href={\`/search?category=\${slug}\`} className="category-card" key={slug}>
                <span className="category-icon"><Icon size={27} /></span>
                <strong>{label}</strong>
                <small>{description}</small>
                <ArrowLeft className="category-arrow" size={17} />
              </Link>
            ))}
          </div>
        </section>

        <section className="section stores-section">
          <div className="container">
            <div className="section-heading">
              <div><h2>فرۆشگا چالاکەکان</h2><p>تەنها فرۆشگاکانی چالاکی داتابەیس پیشان دەدرێن</p></div>
              <Link href="/search" className="text-link">بینینی هەموو <ArrowLeft size={16} /></Link>
            </div>
            {!configured ? (
              <div className="empty-state"><strong>پەیوەندی بە داتابەیس ئامادە نییە</strong><span className="muted">ڕێکخستنی Supabase environment پشکنە.</span></div>
            ) : stores.length === 0 ? (
              <div className="empty-state"><strong>هێشتا فرۆشگای چالاک نییە</strong><span className="muted">کاتێک فرۆشگایەک پەسەند و چالاک بکرێت، لێرە دەردەکەوێت.</span></div>
            ) : (
              <div className="store-grid">{stores.map((store) => <StoreCard key={store.id} store={store} />)}</div>
            )}
          </div>
        </section>

        <section className="container section joining-section">
          <div className="joining-card">
            <div className="joining-icon"><Gift size={34} /></div>
            <div><h2>خاوەنی فرۆشگایت؟</h2><p>داواکاری پەیوەندیکردن بنێرە بۆ ئەوەی فرۆشگاکەت لە شاخ ستوردا بەشداری بکات.</p></div>
            <Link href="/signup" className="button">دروستکردنی هەژمار <ArrowLeft size={18} /></Link>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="container footer-inner"><span className="brand-name">Shakh <b>Store</b></span><span>© {new Date().getFullYear()} شاخ ستور</span><Link href="/login">چوونەژوورەوە</Link></div></footer>
    </>
  );
}
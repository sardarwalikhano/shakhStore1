import Link from "next/link";
import { ArrowLeft, Apple, Beef, CookingPot, Gift, MapPin, ShoppingBasket, Sparkles, Utensils } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { StoreCard } from "@/components/store-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

type StoreCardData = Pick<
  Tables<"stores">,
  "id" | "name" | "slug" | "merchant_category" | "description" | "city" | "district"
>;
type DeliveryZoneData = Pick<
  Tables<"delivery_zones">,
  "id" | "name_ckb" | "city" | "district" | "base_fee_iqd" | "minimum_fee_iqd" | "maximum_fee_iqd"
>;

const categories = [
  { slug: "restaurant", label: "چێشتخانە", description: "خواردنی گەرم و ئامادە", icon: CookingPot },
  { slug: "supermarket", label: "سوپەرمارکێت", description: "پێداویستییە ڕۆژانەکان", icon: ShoppingBasket },
  { slug: "meat_seafood", label: "گۆشت و سپیاتی", description: "گۆشتی تازە و ماسی", icon: Beef },
  { slug: "fruits_vegetables", label: "سەوزە و میوە", description: "بەرهەمی تازە", icon: Apple },
];

function zoneFee(zone: DeliveryZoneData) {
  return Math.min(
    zone.maximum_fee_iqd ?? Number.MAX_SAFE_INTEGER,
    Math.max(zone.base_fee_iqd, zone.minimum_fee_iqd),
  );
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  let stores: StoreCardData[] = [];
  let deliveryZones: DeliveryZoneData[] = [];
  let configured = Boolean(supabase);
  let zonesAvailable = Boolean(supabase);
  let signedInUser = null;

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    signedInUser = user;
    const [storeResult, zoneResult] = await Promise.all([
      supabase.from("stores")
        .select("id,name,slug,merchant_category,description,city,district")
        .eq("status", "active")
        .eq("is_platform_store", false)
        .order("name", { ascending: true })
        .limit(8),
      supabase.from("delivery_zones")
        .select("id,name_ckb,city,district,base_fee_iqd,minimum_fee_iqd,maximum_fee_iqd")
        .eq("is_active", true)
        .order("city")
        .limit(8),
    ]);

    if (!storeResult.error && storeResult.data) stores = storeResult.data;
    else configured = false;

    if (!zoneResult.error && zoneResult.data) deliveryZones = zoneResult.data;
    else zonesAvailable = false;
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
                {!signedInUser && <Link href="/signup" className="button button-secondary">دروستکردنی هەژمار</Link>}
              </div>
              <div className="hero-trust"><span /> بە زمانی کوردی و داواکارییەکی پارێزراو</div>
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
              <Link href={"/search?category=" + slug} className="category-card" key={slug}>
                <span className="category-icon"><Icon size={27} /></span>
                <strong>{label}</strong>
                <small>{description}</small>
                <ArrowLeft className="category-arrow" size={17} />
              </Link>
            ))}
          </div>
        </section>

        <section className="delivery-coverage-section">
          <div className="container">
            <div className="coverage-heading">
              <div><span className="eyebrow"><MapPin size={15} /> ناوچەی گەیاندن</span><h2>لە کوێ گەیاندن چالاکە؟</h2><p>شار و کرێی گەیاندن بە پێی ڕێکخستنی ڕاستەقینەی پلاتفۆرم پیشان دەدرێت.</p></div>
              <span className="coverage-count">{deliveryZones.length.toLocaleString("en-US")} ناوچەی چالاک</span>
            </div>
            {!zonesAvailable ? (
              <div className="coverage-empty">زانیاری ناوچەی گەیاندن لەم کاتەدا بەردەست نییە.</div>
            ) : deliveryZones.length === 0 ? (
              <div className="coverage-empty">خزمەتگوزاری گەیاندن هێشتا لە ناوچەکاندا ڕێکنەخراوە.</div>
            ) : (
              <div className="delivery-zone-preview">
                {deliveryZones.map((zone) => (
                  <article className="delivery-zone-preview-card" key={zone.id}>
                    <span className="coverage-map-icon"><MapPin size={20} /></span>
                    <div><strong>{zone.name_ckb}</strong><small>{zone.city}{zone.district ? "، " + zone.district : " · هەموو شار"}</small></div>
                    <b>{zoneFee(zone).toLocaleString("en-US")} دینار</b>
                  </article>
                ))}
              </div>
            )}
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
            <Link href={signedInUser ? "/dashboard" : "/signup"} className="button">
              {signedInUser ? "چوونە داشبۆرد" : "دروستکردنی هەژمار"} <ArrowLeft size={18} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="container footer-inner"><span className="brand-name">Shakh <b>Store</b></span><span>© {new Date().getFullYear()} شاخ ستور</span><Link href="/login">چوونەژوورەوە</Link></div></footer>
    </>
  );
}

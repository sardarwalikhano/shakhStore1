import { Search } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { StoreCard } from "@/components/store-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

type StoreCardData = Pick<Tables<"stores">, "id" | "name" | "slug" | "merchant_category" | "description" | "city" | "district">;
const categoryMap: Record<string, string> = {
  restaurant: "restaurant",
  supermarket: "supermarket",
  fruits_vegetables: "fruits_vegetables",
  meat_seafood: "meat_seafood",
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const category = params.category ?? "";
  const supabase = await createSupabaseServerClient();
  let stores: StoreCardData[] = [];
  let configured = Boolean(supabase);

  if (supabase) {
    let query = supabase.from("stores")
      .select("id, name, slug, merchant_category, description, city, district")
      .eq("status", "active").eq("is_platform_store", false).order("name").limit(30);
    if (q) query = query.ilike("name", "%" + q.replace(/[%_]/g, "") + "%");
    if (categoryMap[category]) query = query.eq("merchant_category", categoryMap[category]);
    const { data, error } = await query;
    if (data) stores = data;
    if (error) configured = false;
  }

  return (
    <>
      <SiteHeader />
      <main className="container section search-page">
        <div className="search-results-header">
          <div><h1>گەڕانی فرۆشگا</h1><p className="muted">فرۆشگاکانی چالاک بە پێی زانیارییە گشتییەکان دەردەکەون.</p></div>
          <form action="/search" className="search-query-form">
            <input name="q" defaultValue={q} placeholder="ناوی فرۆشگا بگەڕێ..." aria-label="ناوی فرۆشگا" />
            <button className="button" type="submit"><Search size={17} /> گەڕان</button>
          </form>
        </div>
        {!configured ? (
          <div className="empty-state"><strong>پەیوەندی بە داتابەیس نییە</strong><span className="muted">ڕێکخستنی Supabase پشکنە.</span></div>
        ) : stores.length === 0 ? (
          <div className="empty-state"><strong>هیچ فرۆشگایەک نەدۆزرایەوە</strong><span className="muted">گەڕانێکی تر تاقی بکەرەوە یان دواتر سەردان بکە.</span></div>
        ) : (
          <div className="store-grid">{stores.map((store) => <StoreCard key={store.id} store={store} />)}</div>
        )}
      </main>
    </>
  );
}
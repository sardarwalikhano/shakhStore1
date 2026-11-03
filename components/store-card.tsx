import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import type { Tables } from "@/lib/database.types";

type StoreCardData = Pick<
  Tables<"stores">,
  "id" | "name" | "slug" | "merchant_category" | "description" | "city" | "district"
>;

const categoryLabels: Record<string, string> = {
  restaurant: "چێشتخانە",
  supermarket: "سوپەرمارکێت",
  fruits_vegetables: "سەوزە و میوە",
  meat_seafood: "گۆشت و سپیاتی",
};

export function StoreCard({ store }: { store: StoreCardData }) {
  const category = store.merchant_category
    ? categoryLabels[store.merchant_category] ?? "فرۆشگا"
    : "فرۆشگا";

  return (
    <Link href={\`/stores/\${store.slug}\`} className="store-card-link">
      <article className="store-card">
        <div className="store-art" aria-hidden="true">
          <Store size={34} strokeWidth={1.7} />
        </div>
        <div className="store-card-content">
          <div className="store-card-meta">
            <span className="category-pill">{category}</span>
            <span className="status-dot"><i /> چالاک</span>
          </div>
          <h3>{store.name}</h3>
          <p>{store.description || "زانیاری زیاتر لەسەر ئەم فرۆشگایە بەردەست دەبێت."}</p>
          {(store.city || store.district) && (
            <div className="store-location"><MapPin size={15} /> {[store.city, store.district].filter(Boolean).join("، ")}</div>
          )}
        </div>
      </article>
    </Link>
  );
}
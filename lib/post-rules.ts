export type PostStatus = "draft" | "published" | "archived";

export function getPostStatusTargets(status: string): PostStatus[] {
  switch (status) {
    case "draft": return ["published", "archived"];
    case "published": return ["draft", "archived"];
    case "archived": return ["draft"];
    default: return [];
  }
}

export function getPostStatusLabel(status: string): string {
  switch (status) {
    case "published": return "بڵاوکراوە";
    case "archived": return "ئەرشیفکراوە";
    case "draft":
    default: return "ڕەشنووس";
  }
}

export function isValidPostSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}


export type MerchantPostRole =
  | "restaurant"
  | "supermarket"
  | "produce_vendor"
  | "meat_seafood_vendor";

const merchantCategoryByRole: Record<MerchantPostRole, string> = {
  restaurant: "restaurant",
  supermarket: "supermarket",
  produce_vendor: "fruits_vegetables",
  meat_seafood_vendor: "meat_seafood",
};

export function getMerchantCategoryForRole(role: string | null | undefined): string | null {
  if (!role || !(role in merchantCategoryByRole)) return null;
  return merchantCategoryByRole[role as MerchantPostRole];
}

export function isPostManagerRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin" || getMerchantCategoryForRole(role) !== null;
}

export function getPostActorLabel(role: string): string {
  switch (role) {
    case "super_admin": return "سوپەر ئەدمین";
    case "admin": return "بەڕێوەبەر";
    case "restaurant": return "دوکانداری چێشتخانە";
    case "supermarket": return "دوکانداری سوپەرمارکێت";
    case "produce_vendor": return "فرۆشیاری سەوزە و میوە";
    case "meat_seafood_vendor": return "فرۆشیاری گۆشت و سپیاتی";
    default: return "بەکارهێنەر";
  }
}

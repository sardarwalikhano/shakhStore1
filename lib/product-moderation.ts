export type ProductStatus = "draft" | "published" | "archived";

export function getProductModerationTargets(status: string): ProductStatus[] {
  switch (status) {
    case "draft": return ["published", "archived"];
    case "published": return ["draft", "archived"];
    case "archived": return ["draft"];
    default: return [];
  }
}

export function getProductStatusLabel(status: string): string {
  switch (status) {
    case "published": return "بڵاوکراوە";
    case "archived": return "ئەرشیفکراوە";
    case "draft":
    default: return "ڕەشنووس";
  }
}

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

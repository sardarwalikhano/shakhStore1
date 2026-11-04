const AUTH_ORIGIN = "https://auth.local";

export function getSafeAuthNextPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, AUTH_ORIGIN);
    if (parsed.origin !== AUTH_ORIGIN || parsed.pathname.startsWith("//")) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildAuthCallbackUrl(origin: string, next: string): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", getSafeAuthNextPath(next));
  return callback.toString();
}

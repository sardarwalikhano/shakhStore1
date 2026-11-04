import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { getSafeAuthNextPath } from "@/lib/auth-redirects";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeAuthNextPath(searchParams.get("next"));
  const callbackError = searchParams.get("error") || searchParams.get("error_code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!code || !url || !key) {
    const destination = new URL("/login", origin);
    destination.searchParams.set("error", callbackError ? "oauth" : "callback");
    return NextResponse.redirect(destination);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const destination = new URL("/login", origin);
    destination.searchParams.set("error", "callback");
    return NextResponse.redirect(destination);
  }

  return NextResponse.redirect(new URL(next, origin));
}

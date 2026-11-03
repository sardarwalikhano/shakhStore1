import Link from "next/link";
import { Search, ShoppingBag, Store, UserRound } from "lucide-react";
import { CartHeaderButton } from "@/components/cart-header-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  return (
    <header className="site-header">
      <div className="container header-main">
        <Link href="/" className="brand" aria-label="شاخ ستور، پەڕەی سەرەکی">
          <span className="brand-mark" aria-hidden="true">
            <ShoppingBag size={24} strokeWidth={2.4} />
          </span>
          <span className="brand-name">Shakh <b>Store</b></span>
        </Link>

        <form action="/search" className="header-search" role="search">
          <Search size={19} aria-hidden="true" />
          <input
            name="q"
            type="search"
            placeholder="بەرهەم یان فرۆشگا بگەڕێ..."
            aria-label="گەڕان بەدوای بەرهەم یان فرۆشگا"
          />
          <button type="submit">گەڕان</button>
        </form>

        <nav className="header-actions" aria-label="بەستەرە سەرەکییەکان">
          <Link href="/search" className="header-market-link">
            <Store size={17} /> فرۆشگاکان
          </Link>
          <CartHeaderButton />
          <Link
            href={user ? "/dashboard" : "/login"}
            className="button header-login"
          >
            <UserRound size={17} />
            {user ? "داشبۆرد" : "چوونەژوورەوە"}
          </Link>
        </nav>
      </div>

      <div className="header-mobile-search">
        <form action="/search" className="container header-search" role="search">
          <Search size={18} aria-hidden="true" />
          <input
            name="q"
            type="search"
            placeholder="بەرهەم یان فرۆشگا بگەڕێ..."
            aria-label="گەڕان"
          />
          <button type="submit">گەڕان</button>
        </form>
      </div>
    </header>
  );
}

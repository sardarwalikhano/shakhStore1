import Link from "next/link";
import { Bell, MapPin, Search, ShoppingBag, UserRound } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-main">
        <Link href="/" className="brand" aria-label="شاخ ستور، پەڕەی سەرەکی">
          <span className="brand-mark" aria-hidden="true"><ShoppingBag size={25} strokeWidth={2.4} /></span>
          <span className="brand-name">Shakh <b>Store</b></span>
        </Link>

        <div className="header-location">
          <MapPin size={18} />
          <span>شوێنی گەیاندن</span>
          <strong>هەڵیبژێرە</strong>
        </div>

        <form action="/search" className="header-search" role="search">
          <Search size={19} aria-hidden="true" />
          <input name="q" type="search" placeholder="بەرهەم یان فرۆشگا بگەڕێ..." aria-label="گەڕان بەدوای بەرهەم یان فرۆشگا" />
          <button type="submit">گەڕان</button>
        </form>

        <nav className="header-actions" aria-label="بەستەرە سەرەکییەکان">
          <Link href="/login" className="icon-link" aria-label="چوونەژوورەوە"><UserRound size={20} /></Link>
          <Link href="/login" className="icon-link" aria-label="ئاگادارکردنەوەکان"><Bell size={20} /></Link>
          <Link href="/login" className="icon-link cart-link" aria-label="زەمبیل"><ShoppingBag size={20} /></Link>
          <Link href="/login" className="button header-login">چوونەژوورەوە</Link>
        </nav>
      </div>
      <div className="header-mobile-search">
        <form action="/search" className="container header-search" role="search">
          <Search size={18} aria-hidden="true" />
          <input name="q" type="search" placeholder="بەرهەم یان فرۆشگا بگەڕێ..." aria-label="گەڕان" />
          <button type="submit">گەڕان</button>
        </form>
      </div>
    </header>
  );
}
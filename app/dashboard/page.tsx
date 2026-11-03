import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpLeft, Boxes, ClipboardList, LayoutDashboard, MapPinned, Store, Wallet } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  super_admin: "سوپەر ئەدمین",
  admin: "بەڕێوەبەر",
  restaurant: "دوکانداری چێشتخانە",
  supermarket: "دوکانداری سوپەرمارکێت",
  produce_vendor: "فرۆشیاری سەوزە و میوە",
  meat_seafood_vendor: "فرۆشیاری گۆشت و سپیاتی",
  captain: "کاپتنی گەیاندن",
  customer: "کڕیار",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <main className="auth-shell"><section className="auth-card"><h1>ڕێکخستنی Supabase پێویستە</h1><p className="muted">environment variables دابین بکە.</p><Link href="/" className="button">گەڕانەوە</Link></section></main>;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" ? rawRole : null;
  const roleLabel = role ? labels[role] ?? "هەژمار" : "ڕۆڵ دیاری نەکراوە";
  const displayName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر";

  const common = [
    { href: "/dashboard", label: "داشبۆرد", icon: LayoutDashboard },
    { href: "/dashboard/orders", label: "داواکاریەکان", icon: ClipboardList },
  ];
  const roleLinks = role === "super_admin" || role === "admin"
    ? [
        { href: "/dashboard", label: "فرۆشگاکان", icon: Store },
        { href: "/dashboard", label: "کۆگا و بەرهەم", icon: Boxes },
        { href: "/dashboard", label: "حسابداری", icon: Wallet },
        { href: "/dashboard", label: "زۆن و گەیاندن", icon: MapPinned },
      ]
    : role === "captain"
      ? [
          { href: "/dashboard", label: "داواکاریەکانم", icon: ClipboardList },
          { href: "/dashboard", label: "نەخشەی گەیاندن", icon: MapPinned },
          { href: "/dashboard", label: "جزدان", icon: Wallet },
        ]
      : role && role !== "customer"
        ? [
            { href: "/dashboard", label: "داواکاریەکان", icon: ClipboardList },
            { href: "/dashboard", label: "بەرهەمەکان", icon: Boxes },
            { href: "/dashboard", label: "فرۆشگاکەم", icon: Store },
            { href: "/dashboard", label: "حسابداری", icon: Wallet },
          ]
        : [];

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link href="/" className="brand"><span className="brand-mark"><Store size={24} /></span><span className="brand-name">Shakh <b>Store</b></span></Link>
        <nav className="dashboard-nav" aria-label="ڕێنمایی داشبۆرد">
          {[...common, ...roleLinks].map(({ href, label, icon: Icon }, index) => (
            <Link href={href} className={index === 0 ? "active" : ""} key={label}><Icon size={18} />{label}</Link>
          ))}
        </nav>
        <div style={{ marginTop: "auto" }}><Link className="dashboard-nav-link" href="/"><ArrowUpLeft size={17} /> گەڕانەوە بۆ بازاڕ</Link></div>
      </aside>
      <main className="dashboard-main">
        <div className="dashboard-topbar">
          <div><p className="muted" style={{ margin: 0 }}>بەخێربێیت</p><h1>داشبۆرد</h1></div>
          <SignOutButton />
        </div>
        <div className="dashboard-content">
          <section className="dashboard-welcome">
            <span className="role-badge">{roleLabel}</span>
            <h2>سڵاو، {displayName}</h2>
            <p>بەخێربێیت بۆ بەشی تایبەتی خۆت لە شاخ ستور.</p>
          </section>
          {!role ? (
            <section className="dashboard-panel">
              <h3>ڕۆڵی هەژمارەکەت هێشتا دیاری نەکراوە</h3>
              <p>بۆ پاراستنی ئاسایش، بەکارهێنەر ناتوانێت خۆی ڕۆڵی ئەدمین، دوکاندار یان کاپتن دیاری بکات. تکایە چاوەڕێی پشکنین و دانانی ڕۆڵ لەلایەن بەڕێوەبەرەوە بکە.</p>
            </section>
          ) : role === "customer" ? (
            <section className="dashboard-panel">
              <h3>بەشی کڕیار</h3>
              <p>داواکارییەکانت لە بەشی تایبەتی خۆت دەردەکەون. هەروەها دەتوانیت داواکاری بەشداریکردنی فرۆشگا بنێریت.</p>
              <div className="dashboard-quick-links"><Link href="/search" className="text-link">گەڕان لە فرۆشگاکان <ArrowUpLeft size={17} /></Link><Link href="/merchant/apply" className="text-link">داواکاری دوکانداری <ArrowUpLeft size={17} /></Link></div>
            </section>
          ) : (
            <section className="dashboard-panel">
              <h3>ئامرازەکانی {roleLabel}</h3>
              <p>بنەمای دەسەڵات لە claim ـی پشتڕاستکراوی Supabase و RLS ـەوە وەردەگیرێت. لە قۆناغی ئێستادا دەتوانیت داواکاریەکانت ببینیت؛ مۆدیوولەکانی تر بە پێی قۆناغ زیاد دەکرێن.</p>
              {(role === "restaurant" || role === "supermarket" || role === "produce_vendor" || role === "meat_seafood_vendor") && <Link href="/dashboard/products" className="text-link" style={{ marginTop: 14 }}>بەڕێوەبردنی بەرهەمەکان <ArrowUpLeft size={17} /></Link>}
            </section>
          )}
          <section className="dashboard-panel">
            <h3>دۆخی هەژمار</h3>
            <p dir="ltr" style={{ textAlign: "right" }}>{user.email}</p>
            <p className="muted">ناسنامەی هەژمار: <span dir="ltr">{user.id}</span></p>
          </section>
        </div>
      </main>
    </div>
  );
}
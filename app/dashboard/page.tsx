import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpLeft, Boxes, ClipboardList, Gift, MapPinned, Plus, Store, UserRound } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DashboardRole =
  | "super_admin" | "admin" | "restaurant" | "supermarket"
  | "produce_vendor" | "meat_seafood_vendor" | "captain" | "customer";

const labels: Record<DashboardRole, string> = {
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
  const role = typeof rawRole === "string" && rawRole in labels
    ? rawRole as DashboardRole
    : null;
  const displayName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : user.email ?? "بەکارهێنەر";
  const identity = { name: displayName, email: user.email ?? null, role };

  return (
    <DashboardFrame
      identity={identity}
      title="پوختەی هەژمار"
      subtitle="زانیاری و ئامرازەکانی هەژمارەکەت لە یەک شوێن."
      activePath="/dashboard"
    >
      <section className="dashboard-welcome">
        <span className="role-badge">{role ? labels[role] : "ڕۆڵ دیاری نەکراوە"}</span>
        <h2>سڵاو، {displayName}</h2>
        <p>بەخێربێیت بۆ بەشی تایبەتی خۆت لە شاخ ستور.</p>
        {(role === "admin" || role === "super_admin" || role === "restaurant" || role === "supermarket" || role === "produce_vendor" || role === "meat_seafood_vendor") && (
          <div className="dashboard-welcome-actions">
            <Link href="/dashboard/posts" className="button">
              <Plus size={18} /> دروستکردنی پۆستی نوێ
            </Link>
          </div>
        )}
      </section>

      {!role ? (
        <section className="dashboard-panel">
          <h3>ڕۆڵی هەژمارەکەت هێشتا دیاری نەکراوە</h3>
          <p>بۆ پاراستنی ئاسایش، بەکارهێنەر ناتوانێت خۆی ڕۆڵی ئەدمین، دوکاندار یان کاپتن دیاری بکات. تکایە چاوەڕێی پشکنین و دانانی ڕۆڵ لەلایەن بەڕێوەبەرەوە بکە.</p>
        </section>
      ) : role === "customer" ? (
        <section className="dashboard-shortcut-grid">
          <Link href="/dashboard/orders" className="dashboard-shortcut">
            <span><ClipboardList size={21} /></span><strong>داواکاریەکان</strong><small>شوێنکەوتنی داواکارییەکانت</small><ArrowUpLeft size={17} />
          </Link>
          <Link href="/dashboard/share-rewards" className="dashboard-shortcut">
            <span><Gift size={21} /></span><strong>پاداشتی هاوبەشکردن</strong><small>داواکاری و پاداشتەکانت</small><ArrowUpLeft size={17} />
          </Link>
          <Link href="/dashboard/addresses" className="dashboard-shortcut">
            <span><MapPinned size={21} /></span><strong>ناونیشانەکان</strong><small>بەڕێوەبردنی شوێنی گەیاندن</small><ArrowUpLeft size={17} />
          </Link>
          <Link href="/search" className="dashboard-shortcut">
            <span><Store size={21} /></span><strong>گەڕان لە بازاڕ</strong><small>فرۆشگا و بەرهەمەکان ببینە</small><ArrowUpLeft size={17} />
          </Link>
          <Link href="/merchant/apply" className="dashboard-shortcut">
            <span><Boxes size={21} /></span><strong>داواکاری دوکانداری</strong><small>فرۆشگاکەت لە شاخ ستور بەشدار بکە</small><ArrowUpLeft size={17} />
          </Link>
        </section>
      ) : role === "captain" ? (
        <section className="dashboard-panel">
          <h3>کارەکانی گەیاندن</h3>
          <p>داواکارییە سپێردراوەکانت و وردەکاری گەیاندن لێرە ببینە.</p>
          <div className="dashboard-quick-links">
            <Link href="/dashboard/deliveries" className="text-link">کردنەوەی لیستی گەیاندن <ArrowUpLeft size={17} /></Link>
          </div>
        </section>
      ) : (
        <section className="dashboard-panel">
          <h3>ئامرازەکانی {labels[role]}</h3>
          <p>دەستڕاگەیشتن بە پێی ڕۆڵی پشتڕاستکراوی Supabase و policy ـەکانی RLS سنووردارە.</p>
          <div className="dashboard-quick-links">
            <Link href="/dashboard/orders" className="text-link">بینینی داواکاریەکان <ArrowUpLeft size={17} /></Link>
            {(role === "restaurant" || role === "supermarket" || role === "produce_vendor" || role === "meat_seafood_vendor") && (
              <>
                <Link href="/dashboard/products" className="text-link">بەڕێوەبردنی بەرهەمەکان <ArrowUpLeft size={17} /></Link>
                <Link href="/dashboard/posts" className="text-link">پۆستکردنی فرۆشگا <ArrowUpLeft size={17} /></Link>
              </>
            )}
            {(role === "admin" || role === "super_admin") && (
              <>
                <Link href="/dashboard/merchant-applications" className="text-link">پشکنینی داواکاری فرۆشگا <ArrowUpLeft size={17} /></Link>
                <Link href="/dashboard/product-moderation" className="text-link">پشکنینی بەرهەم <ArrowUpLeft size={17} /></Link>
                <Link href="/dashboard/posts" className="text-link">بەڕێوەبردنی پۆست و ئاگاداری <ArrowUpLeft size={17} /></Link>
                <Link href="/dashboard/delivery-zones" className="text-link">بەڕێوەبردنی ناوچەکان <ArrowUpLeft size={17} /></Link>
                {role === "super_admin" && <Link href="/dashboard/captains" className="text-link">بەڕێوەبردنی کاپتنەکان <UserRound size={17} /></Link>}
                {role === "super_admin" && <Link href="/dashboard/share-rewards" className="text-link">پشکنینی داواکاری پاداشت <Gift size={17} /></Link>}
                <Link href="/dashboard/deliveries" className="text-link">چاودێری گەیاندنەکان <ArrowUpLeft size={17} /></Link>
              </>
            )}
          </div>
        </section>
      )}

      <section className="dashboard-panel dashboard-account-panel">
        <div><h3>زانیاری هەژمار</h3><p>ئیمەیڵی تۆمارکراو</p></div>
        <strong dir="ltr">{user.email}</strong>
      </section>
    </DashboardFrame>
  );
}

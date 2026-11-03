import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Store } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MerchantApplicationForm } from "./form";

const statusLabels: Record<string, string> = {
  submitted: "نێردراوە",
  under_review: "لەژێر پشکنیندایە",
  approved: "پەسەند کراوە",
  rejected: "ڕەتکرایەوە",
};

export const dynamic = "force-dynamic";

export default async function MerchantApplyPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: applications } = await supabase.from("merchant_applications")
    .select("id, business_name, status, submitted_at, review_note")
    .eq("applicant_id", user.id)
    .order("submitted_at", { ascending: false })
    .limit(5);

  return (
    <>
      <SiteHeader />
      <main className="container section merchant-page">
        <Link href="/dashboard" className="text-link"><ArrowRight size={17} /> گەڕانەوە بۆ داشبۆرد</Link>
        <section className="merchant-intro">
          <span className="merchant-intro-icon"><Store size={30} /></span>
          <div><h1>داواکاری بەشداریکردنی فرۆشگا</h1><p>زانیاریی بازرگانییەکەت بنێرە. پەسەندکردنی داواکاری و دانانی ڕۆڵ لەلایەن بەڕێوەبەری شاخ ستورەوە ئەنجام دەدرێت.</p></div>
        </section>
        {applications && applications.length > 0 && (
          <section className="dashboard-panel">
            <h2>مێژووی داواکارییەکانت</h2>
            <div className="application-list">
              {applications.map((application) => (
                <article className="application-row" key={application.id}>
                  <div><strong>{application.business_name}</strong><p className="muted">نێردراوە: {new Date(application.submitted_at).toLocaleDateString("ckb-IQ")}</p></div>
                  <span className="role-badge">{statusLabels[application.status] ?? application.status}</span>
                  {application.review_note && <p className="application-note">{application.review_note}</p>}
                </article>
              ))}
            </div>
          </section>
        )}
        <MerchantApplicationForm />
      </main>
    </>
  );
}
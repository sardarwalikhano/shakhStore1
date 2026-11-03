import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard-frame";
import { MerchantApplicationReview } from "@/components/merchant-application-review";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MerchantApplicationsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roleValue = user.app_metadata?.role;
  const role = roleValue === "admin" || roleValue === "super_admin" ? roleValue : null;
  const { data: applications, error } = await supabase.from("merchant_applications")
    .select("id,business_name,merchant_category,description,contact_person,phone,city,district,address_line,status,submitted_at,review_note")
    .order("submitted_at", { ascending: false })
    .limit(100);

  return (
    <DashboardFrame
      identity={{
        name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
        email: user.email ?? null,
        role,
      }}
      title="پشکنینی داواکاری فرۆشگا"
      subtitle="داواکارییەکانی دوکاندار پشکنە و بڕیاری پەسەندکردن یان ڕەتکردنەوە بدە."
      activePath="/dashboard/merchant-applications"
    >
      {role === null ? (
        <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
      ) : error ? (
        <div className="empty-state"><strong>نەتوانرا داواکارییەکان بخوێندرێنەوە</strong><span className="muted">دەستڕاگەیشتنی ئەدمین و policy ـەکان پشکنە.</span></div>
      ) : (
        <MerchantApplicationReview initialApplications={applications ?? []} />
      )}
    </DashboardFrame>
  );
}

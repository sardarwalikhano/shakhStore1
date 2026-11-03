import { redirect } from "next/navigation";
import { AddressBook } from "@/components/address-book";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roleValue = user.app_metadata?.role;
  const role = roleValue === "customer" ? "customer" : null;
  const { data: addresses, error } = await supabase.from("customer_addresses")
    .select("*").eq("customer_id", user.id).eq("is_active", true)
    .order("is_default", { ascending: false }).order("created_at", { ascending: false });

  return (
    <DashboardFrame
      identity={{
        name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
        email: user.email ?? null,
        role,
      }}
      title="ناونیشانەکانی گەیاندن"
      subtitle="ناونیشانەکانت زیاد بکە و یەکێکیان وەک بنەڕەتی دیاری بکە."
      activePath="/dashboard/addresses"
    >
      {role !== "customer" ? (
        <div className="empty-state"><strong>ئەم بەشە تەنها بۆ هەژماری کڕیارە.</strong></div>
      ) : error ? (
        <div className="empty-state"><strong>نەتوانرا ناونیشانەکان بخوێندرێنەوە</strong><span className="muted">دەستڕاگەیشتنی هەژمارەکەت پشکنە.</span></div>
      ) : (
        <AddressBook userId={user.id} initialAddresses={addresses ?? []} />
      )}
    </DashboardFrame>
  );
}

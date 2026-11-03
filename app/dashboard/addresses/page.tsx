import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AddressBook } from "@/components/address-book";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: addresses } = await supabase.from("customer_addresses")
    .select("*").eq("customer_id", user.id).eq("is_active", true)
    .order("is_default", {ascending:false}).order("created_at", {ascending:false});

  return (
    <main className="container section addresses-page">
      <Link href="/dashboard" className="text-link"><ArrowRight size={17} /> گەڕانەوە بۆ داشبۆرد</Link>
      <div className="section-heading" style={{marginTop:22}}><div><h1>ناونیشانەکانی گەیاندن</h1><p>ناونیشانەکانت زیاد بکە و یەکێکیان وەک بنەڕەتی دیاری بکە.</p></div></div>
      <AddressBook userId={user.id} initialAddresses={addresses ?? []} />
    </main>
  );
}
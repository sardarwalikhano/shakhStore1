import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpLeft, Wallet } from "lucide-react";
import { DashboardFrame, type DashboardRole } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Balance = { wallet_account_id: string; account_type: string; balance_iqd: number; status: string };
type Entry = { id: string; entry_type: "debit" | "credit"; amount_iqd: number; memo: string | null; created_at: string };

const money = (value: number) => new Intl.NumberFormat("ckb-IQ", { maximumFractionDigits: 0 }).format(value) + " د.ع";

export default async function WalletPage() {
 const supabase = await createSupabaseServerClient();
 if (!supabase) redirect("/login");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) redirect("/login");
 const [balancesResult, entriesResult] = await Promise.all([
  supabase.from("wallet_balances").select("wallet_account_id,account_type,balance_iqd,status").eq("user_id", user.id),
  supabase.from("wallet_ledger_entries").select("id,entry_type,amount_iqd,memo,created_at").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(50),
 ]);
 const balances = (balancesResult.data ?? []) as Balance[];
 const entries = (entriesResult.data ?? []) as Entry[];
 const total = balances.reduce((sum, account) => sum + Number(account.balance_iqd), 0);
 const roleValue = user.app_metadata?.role;\n const allowedRoles: DashboardRole[] = ["super_admin", "admin", "restaurant", "supermarket", "produce_vendor", "meat_seafood_vendor", "captain", "customer"];\n const role: DashboardRole = typeof roleValue === "string" && allowedRoles.includes(roleValue as DashboardRole)\n  ? roleValue as DashboardRole\n  : null;
 const identity = { name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر", email: user.email ?? null, role };
 return <DashboardFrame identity={identity} title="جزدانی من" subtitle="باڵانسی جزدان و مێژووی جووڵەکانت." activePath="/dashboard/wallet">
  <section className="dashboard-welcome">
   <span className="role-badge"><Wallet size={16}/> جزدان</span>
   <h2>{money(total)}</h2><p>کۆی باڵانسی هەژمارەکانی تۆ</p>
  </section>
  <section className="dashboard-panel">
   <h3>هەژمارەکان</h3>
   {balances.length ? <div className="dashboard-quick-links">{balances.map((account) => <div key={account.wallet_account_id} className="text-link"><span>{account.account_type === "customer" ? "جزدانی کڕیار" : account.account_type === "captain" ? "جزدانی کاپتن" : "جزدانی دوکاندار"}</span><strong>{money(Number(account.balance_iqd))}</strong></div>)}</div> : <p>هێشتا جزدانێک بۆ ئەم هەژمارە دروست نەکراوە. تکایە بەڕێوەبەر ئاگادار بکە.</p>}
  </section>
  <section className="dashboard-panel">
   <h3>مێژووی جووڵەکان</h3>
   {entries.length ? <div className="dashboard-quick-links">{entries.map((entry) => <div key={entry.id} className="text-link"><span>{entry.memo || (entry.entry_type === "credit" ? "پارەی هاتوو" : "پارەی چوو")}<small>{new Date(entry.created_at).toLocaleString("ckb-IQ")}</small></span><strong>{entry.entry_type === "credit" ? "+" : "−"}{money(Number(entry.amount_iqd))}</strong></div>)}</div> : <p>هیچ جووڵەیەکی تۆمارکراو نییە.</p>}
  </section>
  <Link href="/dashboard" className="text-link"><ArrowUpLeft size={17}/> گەڕانەوە بۆ داشبۆرد</Link>
 </DashboardFrame>;
}

import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, WalletCards } from "lucide-react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedRoles = new Set([
  "customer", "captain", "admin", "super_admin",
  "restaurant", "supermarket", "produce_vendor", "meat_seafood_vendor",
]);

const accountLabels: Record<string, string> = {
  customer: "جزدانی کڕیار",
  merchant: "جزدانی دوکاندار",
  captain: "جزدانی کاپتن",
  platform: "هەژماری پلاتفۆرم",
  cash_clearing: "پارەی نەقدی لای کاپتن (Cash Clearing)",
  escrow: "هەژماری پارێزراوی پاداشت (Escrow)",
};

const ruleLabels: Record<string, string> = {
  merchant: "کۆمسیۆنی دوکاندار",
  delivery_platform: "بەشی پلاتفۆرم لە گەیاندن",
};

function money(value: number | null) {
  return `${(value ?? 0).toLocaleString("en-US")} دینار`;
}

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawRole = user.app_metadata?.role;
  const role = typeof rawRole === "string" && allowedRoles.has(rawRole) ? rawRole : null;
  if (!role) redirect("/dashboard");

  const isAdmin = role === "admin" || role === "super_admin";
  const balanceQuery = supabase
    .from("wallet_balances")
    .select("wallet_account_id, account_key, account_type, user_id, store_id, status, balance_iqd, ledger_entry_count")
    .order("account_type", { ascending: true })
    .limit(100);

  if (!isAdmin) balanceQuery.eq("user_id", user.id);

  const { data: balances, error: balancesError } = await balanceQuery;
  const accountIds = (balances ?? [])
    .map((account) => account.wallet_account_id)
    .filter((id): id is string => Boolean(id));

  let entries: Array<{
    id: string;
    wallet_account_id: string;
    entry_type: string;
    amount_iqd: number;
    memo: string | null;
    created_at: string;
  }> = [];
  let entriesError: string | null = null;

  if (accountIds.length > 0) {
    const { data, error } = await supabase
      .from("wallet_ledger_entries")
      .select("id, wallet_account_id, entry_type, amount_iqd, memo, created_at")
      .in("wallet_account_id", accountIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) entriesError = error.message;
    else entries = data ?? [];
  }

  let rules: Array<{
    id: string;
    rule_key: string;
    scope_type: string;
    charge_type: string;
    calculation_method: string;
    calculation_basis: string;
    amount_iqd: number | null;
    basis_points: number | null;
    is_active: boolean;
    effective_from: string;
  }> = [];
  let rulesError: string | null = null;

  if (isAdmin) {
    const { data, error } = await supabase
      .from("commission_rules")
      .select("id, rule_key, scope_type, charge_type, calculation_method, calculation_basis, amount_iqd, basis_points, is_active, effective_from")
      .order("effective_from", { ascending: false })
      .limit(50);
    if (error) rulesError = error.message;
    else rules = data ?? [];
  }

  const name = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : user.email ?? "بەکارهێنەر";
  return (
    <DashboardFrame
      identity={{
        name,
        email: user.email ?? null,
        role: role as "super_admin" | "admin" | "restaurant" | "supermarket" | "produce_vendor" | "meat_seafood_vendor" | "captain" | "customer",
      }}
      title="جزدان و کۆمسیۆن"
      subtitle={isAdmin
        ? "چاودێری باڵانس، مامەڵەکان و ڕێساکانی کۆمسیۆن."
        : "باڵانسی جزدان و مێژووی تۆمارە داراییەکانت."}
      activePath="/dashboard/wallets"
    >
      {balancesError ? (
        <div className="empty-state">
          <strong>نەتوانرا زانیاریی جزدان بخوێندرێتەوە</strong>
          <span className="muted">دەستڕاگەیشتنی RLS و پەیوەندی Supabase پشکنە.</span>
        </div>
      ) : (
        <>
          <section className="dashboard-shortcut-grid">
            {(balances ?? []).map((account) => (
              <article className="dashboard-panel" key={account.wallet_account_id}>
                <div className="dashboard-topbar">
                  <div>
                    <span className="role-badge">{accountLabels[account.account_type ?? ""] ?? account.account_type ?? "جزدان"}</span>
                    <h3>{account.store_id ? `فرۆشگا ${account.store_id.slice(0, 8)}` : account.account_key ?? "—"}</h3>
                  </div>
                  <WalletCards size={22} />
                </div>
                <strong style={{ display: "block", fontSize: "1.45rem", marginTop: 12 }}>
                  {money(account.balance_iqd)}
                </strong>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {account.ledger_entry_count ?? 0} تۆماری ledger · دۆخ: {account.status}
                </p>
              </article>
            ))}
          </section>

          {(balances ?? []).length === 0 && (
            <div className="empty-state">
              <WalletCards size={32} color="#d96b24" />
              <strong>هێشتا هیچ جزدانێک بۆ ئەم هەژمارە دروست نەکراوە</strong>
              <span className="muted">دوای چالاکبوونی ڕۆڵ یان فرۆشگا، جزدان بە شێوەی خۆکار دروست دەبێت.</span>
            </div>
          )}

          <section className="dashboard-panel">
            <h3>مێژووی مامەڵەکان</h3>
            {entriesError ? (
              <p className="form-error">نەتوانرا مێژووی مامەڵەکان بخوێندرێتەوە.</p>
            ) : entries.length === 0 ? (
              <p className="muted">هێشتا هیچ مامەڵەیەکی ledger تۆمار نەکراوە.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>جۆر</th><th>بڕ</th><th>هۆکار</th><th>بەروار</th></tr></thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            {entry.entry_type === "credit" ? <ArrowDownLeft size={16} color="#198754" /> : <ArrowUpRight size={16} color="#b45309" />}
                            {entry.entry_type === "credit" ? "هاتوو" : "دەرچوو"}
                          </span>
                        </td>
                        <td>{money(entry.amount_iqd)}</td>
                        <td>{entry.memo ?? "تێبینی نییە"}</td>
                        <td>{new Date(entry.created_at).toLocaleString("ckb-IQ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {isAdmin && (
        <section className="dashboard-panel">
          <h3>ڕێساکانی کۆمسیۆنی چالاک</h3>
          {rulesError ? (
            <p className="form-error">نەتوانرا ڕێساکانی کۆمسیۆن بخوێندرێنەوە.</p>
          ) : rules.length === 0 ? (
            <p className="muted">هیچ ڕێسایەکی کۆمسیۆن نییە.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>جۆری کۆمسیۆن</th><th>شێوازی حیساب</th><th>نرخ</th><th>دۆخ</th></tr></thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{ruleLabels[rule.charge_type] ?? rule.charge_type}</td>
                      <td>{rule.calculation_method === "fixed_per_kg" ? "بۆ هەر کیلۆ" : rule.calculation_method === "percentage" ? "ڕێژەی سەدی" : "بۆ هەر داواکاری"}</td>
                      <td>
                        {rule.calculation_method === "fixed_per_kg" || rule.calculation_method === "fixed_per_order"
                          ? money(rule.amount_iqd)
                          : `${((rule.basis_points ?? 0) / 100).toLocaleString("en-US")}%`}
                      </td>
                      <td><span className="status-pill">{rule.is_active ? "چالاک" : "ناچالاک"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            گۆڕینی ڕێساکان تەنها لە ڕێگەی RPC ـی تایبەتی ئەدمین و audit trail دەکرێت؛ ئەم پەڕەیە تەنها خوێندنەوەیە.
          </p>
        </section>
      )}
    </DashboardFrame>
  );
}

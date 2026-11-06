import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationPath = new URL(
  "../supabase/migrations/20261105224000_m23_cod_cash_clearing_preserve_escrow.sql",
  import.meta.url,
);
const migration = readFileSync(fileURLToPath(migrationPath), "utf8");

test("M23 creates a dedicated cash-clearing account and preserves escrow", () => {
  assert.match(migration, /'cash_clearing'/);
  assert.match(migration, /'cash-clearing:delivery'/);
  assert.match(migration, /'platform','escrow','cash_clearing'/);
  assert.match(migration, /account_type='cash_clearing'/);
});

test("M23 uses debit-normal balances only for cash clearing", () => {
  assert.match(migration, /when wa\.account_type='cash_clearing' and e\.entry_type='debit' then e\.amount_iqd/);
  assert.match(migration, /when wa\.account_type='cash_clearing' and e\.entry_type='credit' then -e\.amount_iqd/);
  assert.match(migration, /when wa\.account_type<>'cash_clearing' and e\.entry_type='credit' then e\.amount_iqd/);
  assert.match(migration, /security_invoker=true/);
});

test("M23 posts COD cash to clearing, not directly as a platform debit", () => {
  assert.match(migration, /'wallet_account_id',v_cash_clearing_wallet_id,'entry_type','debit'/);
  assert.match(migration, /'wallet_account_id',v_platform_wallet_id,'entry_type','credit'/);
  assert.doesNotMatch(migration, /'wallet_account_id',v_platform_wallet_id,'entry_type','debit'/);
});

test("M23 keeps ledger posting backend-only and permits clearing receivables", () => {
  assert.match(migration, /current_user not in \('service_role','postgres'\)/);
  assert.match(migration, /wa\.account_type not in \('platform','cash_clearing'\)/);
  assert.match(migration, /revoke all on function public\.post_wallet_transaction\(uuid,jsonb\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.post_wallet_transaction\(uuid,jsonb\) to service_role/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { isCaptainEligibleForZone } from "../lib/captain-scope.ts";

const base = {
  is_active: true,
  email_confirmed: true,
};

test("global captains can be selected for deliveries in any zone", () => {
  assert.equal(isCaptainEligibleForZone({ ...base, scope_type: "global", zone_ids: [] }, "zone-a"), true);
  assert.equal(isCaptainEligibleForZone({ ...base, scope_type: "global", zone_ids: [] }, null), true);
});

test("zone-scoped captains are limited to their assigned zones", () => {
  const captain = { ...base, scope_type: "zones", zone_ids: ["zone-a", "zone-b"] };
  assert.equal(isCaptainEligibleForZone(captain, "zone-a"), true);
  assert.equal(isCaptainEligibleForZone(captain, "zone-b"), true);
  assert.equal(isCaptainEligibleForZone(captain, "zone-c"), false);
  assert.equal(isCaptainEligibleForZone(captain, null), false);
});

test("inactive or unconfirmed captains cannot receive new deliveries", () => {
  assert.equal(isCaptainEligibleForZone({ is_active: false, email_confirmed: true, scope_type: "global", zone_ids: [] }, "zone-a"), false);
  assert.equal(isCaptainEligibleForZone({ is_active: true, email_confirmed: false, scope_type: "global", zone_ids: [] }, "zone-a"), false);
});

test("unknown scopes fail closed", () => {
  assert.equal(isCaptainEligibleForZone({ ...base, scope_type: "unknown", zone_ids: ["zone-a"] }, "zone-a"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { getCodDeliveryFeeShare } from "../lib/cod-allocation.ts";

const consignments = [
  { id: "store-a", createdAt: "2026-11-05T10:00:00Z", itemsSubtotalIqd: 10000 },
  { id: "store-b", createdAt: "2026-11-05T10:01:00Z", itemsSubtotalIqd: 20000 },
];

test("allocates the complete delivery fee to a single consignment", () => {
  assert.equal(getCodDeliveryFeeShare(1500, 10000, [consignments[0]], "store-a"), 1500);
});

test("allocates delivery fee proportionally and assigns rounding remainder to last", () => {
  const a = getCodDeliveryFeeShare(1000, 30000, consignments, "store-a");
  const b = getCodDeliveryFeeShare(1000, 30000, consignments, "store-b");
  assert.equal(a, 333);
  assert.equal(b, 667);
  assert.equal((a ?? 0) + (b ?? 0), 1000);
});

test("assigns all delivery fee to last consignment when goods subtotal is zero", () => {
  const zero = consignments.map((item) => ({ ...item, itemsSubtotalIqd: 0 }));
  assert.equal(getCodDeliveryFeeShare(700, 0, zero, "store-a"), 0);
  assert.equal(getCodDeliveryFeeShare(700, 0, zero, "store-b"), 700);
});

test("returns null for an unknown consignment", () => {
  assert.equal(getCodDeliveryFeeShare(100, 1000, consignments, "missing"), null);
});

test("rejects non-integer or negative monetary values", () => {
  assert.throws(() => getCodDeliveryFeeShare(-1, 100, consignments, "store-a"), RangeError);
  assert.throws(() => getCodDeliveryFeeShare(100, 100.5, consignments, "store-a"), RangeError);
});

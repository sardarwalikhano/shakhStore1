import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCartSubtotal,
  calculateFlatDeliveryFee,
  isValidCartLine,
  normalizeCartQuantity,
  resolveDeliveryZone,
  supportsFractionalQuantity,
  type DeliveryZoneRule,
} from "../lib/marketplace-rules.ts";

const cityWide: DeliveryZoneRule = {
  city: "بەردەڕەش",
  district: null,
  is_active: true,
  base_fee_iqd: 1000,
  minimum_fee_iqd: 0,
  maximum_fee_iqd: null,
  per_km_fee_iqd: 0,
};

test("city-wide delivery zone matches city and district with trimmed case-insensitive values", () => {
  const zone = resolveDeliveryZone([cityWide], " بەردەڕەش ", "گەڕەکی نموونە");
  assert.equal(zone, cityWide);
});

test("a district-specific active zone takes precedence over the city-wide zone", () => {
  const districtZone = { ...cityWide, district: "ناوەندی" as string | null, base_fee_iqd: 1500 };
  const zone = resolveDeliveryZone([cityWide, districtZone], "بەردەڕەش", "ناوەندی");
  assert.equal(zone, districtZone);
});

test("inactive exact district does not hide an active city-wide zone", () => {
  const inactiveDistrict = { ...cityWide, district: "ناوەندی" as string | null, is_active: false };
  const zone = resolveDeliveryZone([inactiveDistrict, cityWide], "بەردەڕەش", "ناوەندی");
  assert.equal(zone, cityWide);
});

test("delivery zone lookup rejects a different city and blank location", () => {
  assert.equal(resolveDeliveryZone([cityWide], "هەولێر", "ناوەندی"), null);
  assert.equal(resolveDeliveryZone([cityWide], "", "ناوەندی"), null);
});

test("flat delivery fee applies the larger of base and minimum then caps the maximum", () => {
  assert.equal(calculateFlatDeliveryFee({
    ...cityWide,
    base_fee_iqd: 1500,
    minimum_fee_iqd: 2000,
    maximum_fee_iqd: 1800,
  }), 1800);
});

test("distance pricing and inactive zones are not treated as flat-rate serviceable", () => {
  assert.equal(calculateFlatDeliveryFee({ ...cityWide, per_km_fee_iqd: 250 }), null);
  assert.equal(calculateFlatDeliveryFee({ ...cityWide, is_active: false }), null);
  assert.equal(calculateFlatDeliveryFee(null), null);
});

test("invalid fee configuration is rejected rather than displayed as a valid quote", () => {
  assert.equal(calculateFlatDeliveryFee({ ...cityWide, base_fee_iqd: -1 }), null);
  assert.equal(calculateFlatDeliveryFee({ ...cityWide, maximum_fee_iqd: -1 }), null);
  assert.equal(calculateFlatDeliveryFee({ ...cityWide, minimum_fee_iqd: 100, maximum_fee_iqd: 50 }), null);
});

test("kg and liter support two decimal places while piece and pack stay integral", () => {
  assert.equal(supportsFractionalQuantity("kg"), true);
  assert.equal(supportsFractionalQuantity("liter"), true);
  assert.equal(supportsFractionalQuantity("piece"), false);
  assert.equal(normalizeCartQuantity("kg", 0.126, null), 0.13);
  assert.equal(normalizeCartQuantity("liter", 1.239, null), 1.24);
  assert.equal(normalizeCartQuantity("piece", 2.9, null), 2);
  assert.equal(normalizeCartQuantity("pack", 3.9, null), 3);
});

test("cart quantities reject zero, negative, non-finite, and exhausted stock", () => {
  assert.equal(normalizeCartQuantity("kg", 0, null), null);
  assert.equal(normalizeCartQuantity("piece", -1, null), null);
  assert.equal(normalizeCartQuantity("piece", Number.NaN, null), null);
  assert.equal(normalizeCartQuantity("piece", 1, 0), null);
});

test("cart quantity is clamped to the currently reported available stock", () => {
  assert.equal(normalizeCartQuantity("piece", 9, 3), 3);
  assert.equal(normalizeCartQuantity("kg", 2.5, 2), 2);
});

test("persisted cart line validation rejects malformed and negative-price items", () => {
  assert.equal(isValidCartLine({
    productId: "p1", unit: "piece", unitPriceIqd: 1000,
    stockQuantity: 3, quantity: 1,
  }), true);
  assert.equal(isValidCartLine({
    productId: "p1", unit: "piece", unitPriceIqd: -1000,
    stockQuantity: 3, quantity: 1,
  }), false);
  assert.equal(isValidCartLine(null), false);
  assert.equal(isValidCartLine({ productId: "p1", quantity: 1 }), false);
});

test("subtotal rounds each product line using server-compatible positive IQD rounding", () => {
  assert.equal(calculateCartSubtotal([
    { unitPriceIqd: 125, quantity: 1.5 },
    { unitPriceIqd: 300, quantity: 2 },
  ]), 788);
});

test("subtotal ignores invalid line data defensively", () => {
  assert.equal(calculateCartSubtotal([
    { unitPriceIqd: 100, quantity: 2 },
    { unitPriceIqd: Number.NaN, quantity: 1 },
    { unitPriceIqd: 100, quantity: 0 },
  ]), 200);
});

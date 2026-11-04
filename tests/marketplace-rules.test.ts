import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCartSubtotal,
  calculateFlatDeliveryFee,
  getDefaultOrderRules,
  getUnitLabelCkb,
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

test("flat delivery fee applies the larger of base and minimum then caps a valid maximum", () => {
  assert.equal(calculateFlatDeliveryFee({
    ...cityWide, base_fee_iqd: 2500, minimum_fee_iqd: 2000, maximum_fee_iqd: 2200,
  }), 2200);
});

test("distance pricing and inactive zones are not treated as flat-rate serviceable", () => {
  assert.equal(calculateFlatDeliveryFee({ ...cityWide, per_km_fee_iqd: 250 }), null);
  assert.equal(calculateFlatDeliveryFee({ ...cityWide, is_active: false }), null);
  assert.equal(calculateFlatDeliveryFee(null), null);
});

test("kg and liter use fractional quantities; discrete units remain whole", () => {
  assert.equal(supportsFractionalQuantity("kg"), true);
  assert.equal(supportsFractionalQuantity("liter"), true);
  assert.equal(supportsFractionalQuantity("piece"), false);
  assert.equal(normalizeCartQuantity("kg", 0.31, null), 0.30);
  assert.equal(normalizeCartQuantity("liter", 1.239, null), 1.25);
  assert.equal(normalizeCartQuantity("piece", 2.9, null), 2);
  assert.equal(normalizeCartQuantity("pack", 3.9, null), 3);
});

test("default order rules reflect weight, liquid, gram and unit-based products", () => {
  assert.deepEqual(getDefaultOrderRules("kg"), { minOrderQuantity: 0.25, maxOrderQuantity: null, quantityStep: 0.05 });
  assert.deepEqual(getDefaultOrderRules("liter"), { minOrderQuantity: 0.25, maxOrderQuantity: null, quantityStep: 0.05 });
  assert.deepEqual(getDefaultOrderRules("g"), { minOrderQuantity: 100, maxOrderQuantity: null, quantityStep: 50 });
  assert.deepEqual(getDefaultOrderRules("piece"), { minOrderQuantity: 1, maxOrderQuantity: null, quantityStep: 1 });
  assert.equal(getUnitLabelCkb("kg"), "کیلۆگرام");
  assert.equal(getUnitLabelCkb("bottle"), "بوتڵ");
});

test("minimum, maximum, increment and fractional inventory are enforced in cart", () => {
  assert.equal(normalizeCartQuantity("kg", 0.25, 1, 0.25, 0.75, 0.05), 0.25);
  assert.equal(normalizeCartQuantity("kg", 0.42, 1, 0.25, 0.75, 0.05), 0.4);
  assert.equal(normalizeCartQuantity("kg", 0.9, 1, 0.25, 0.75, 0.05), 0.75);
  assert.equal(normalizeCartQuantity("kg", 0.2, 1, 0.25, 0.75, 0.05), null);
  assert.equal(normalizeCartQuantity("kg", 0.5, 0.3, 0.25, null, 0.05), 0.3);
  assert.equal(normalizeCartQuantity("kg", 0.25, 0.2, 0.25, null, 0.05), null);
  assert.equal(normalizeCartQuantity("g", 150, 500, 100, null, 50), 150);
  assert.equal(normalizeCartQuantity("g", 175, 500, 100, null, 50), 200);
  assert.equal(normalizeCartQuantity("piece", 2.5, 10, 1, null, 1), 2);
});

test("cart quantities reject invalid stock and invalid order rules", () => {
  assert.equal(normalizeCartQuantity("kg", 0, null), null);
  assert.equal(normalizeCartQuantity("piece", -1, null), null);
  assert.equal(normalizeCartQuantity("piece", Number.NaN, null), null);
  assert.equal(normalizeCartQuantity("kg", 0.5, -1), null);
  assert.equal(normalizeCartQuantity("kg", 0.5, null, 0, null, 0.05), null);
  assert.equal(normalizeCartQuantity("kg", 0.5, null, 0.25, 0.2, 0.05), null);
});

test("persisted cart line validation accepts optional purchase rules and fractional stock", () => {
  assert.equal(isValidCartLine({
    productId: "p1", unit: "kg", unitPriceIqd: 2500,
    stockQuantity: 2.5, quantity: 0.5,
    minOrderQuantity: 0.25, maxOrderQuantity: 1.5, quantityStep: 0.05,
  }), true);
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


test("kg and liter quantities accept fractional defaults and unit-price is independent from quantity precision", () => {
  const kg = getDefaultOrderRules("kg");
  const liter = getDefaultOrderRules("liter");
  assert.deepEqual(kg, { minOrderQuantity: 0.25, maxOrderQuantity: null, quantityStep: 0.05 });
  assert.deepEqual(liter, { minOrderQuantity: 0.25, maxOrderQuantity: null, quantityStep: 0.05 });
  assert.equal(normalizeCartQuantity("kg", 0.5, 2, kg.minOrderQuantity, kg.maxOrderQuantity, kg.quantityStep), 0.5);
  assert.equal(normalizeCartQuantity("liter", 0.75, 2, liter.minOrderQuantity, liter.maxOrderQuantity, liter.quantityStep), 0.75);
});

test("grams and milliliters remain integer-based while kg and liter are fractional", () => {
  assert.equal(normalizeCartQuantity("g", 150, 1000, 100, null, 50), 150);
  assert.equal(normalizeCartQuantity("ml", 250, 1000, 100, null, 50), 250);
  assert.equal(normalizeCartQuantity("g", 150.5, 1000, 100, null, 50), 150);
});

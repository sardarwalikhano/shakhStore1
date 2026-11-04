import assert from "node:assert/strict";
import test from "node:test";
import { getProductModerationTargets, getProductStatusLabel } from "../lib/product-moderation.ts";

test("draft products can be published or archived", () => {
  assert.deepEqual(getProductModerationTargets("draft"), ["published", "archived"]);
});
test("published products can return to draft or be archived", () => {
  assert.deepEqual(getProductModerationTargets("published"), ["draft", "archived"]);
});
test("archived products must return to draft before publishing", () => {
  assert.deepEqual(getProductModerationTargets("archived"), ["draft"]);
});
test("unknown statuses cannot be moderated", () => {
  assert.deepEqual(getProductModerationTargets("deleted"), []);
});
test("status labels use the expected Sorani strings", () => {
  assert.equal(getProductStatusLabel("published"), "بڵاوکراوە");
  assert.equal(getProductStatusLabel("archived"), "ئەرشیفکراوە");
  assert.equal(getProductStatusLabel("draft"), "ڕەشنووس");
});

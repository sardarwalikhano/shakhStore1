import assert from "node:assert/strict";
import test from "node:test";
import { getPostStatusLabel, getPostStatusTargets, isValidPostSlug } from "../lib/post-rules.ts";

test("draft posts can be published or archived", () => {
  assert.deepEqual(getPostStatusTargets("draft"), ["published", "archived"]);
});
test("published posts can be unpublished or archived", () => {
  assert.deepEqual(getPostStatusTargets("published"), ["draft", "archived"]);
});
test("archived posts must be restored to draft", () => {
  assert.deepEqual(getPostStatusTargets("archived"), ["draft"]);
});
test("invalid statuses cannot be changed", () => {
  assert.deepEqual(getPostStatusTargets("unknown"), []);
});
test("post slugs accept lowercase words separated by single hyphens", () => {
  assert.equal(isValidPostSlug("shakh-update-2026"), true);
  assert.equal(isValidPostSlug("UPPER"), false);
  assert.equal(isValidPostSlug("two--hyphens"), false);
  assert.equal(isValidPostSlug("-leading"), false);
});
test("post status labels are localized", () => {
  assert.equal(getPostStatusLabel("published"), "بڵاوکراوە");
  assert.equal(getPostStatusLabel("draft"), "ڕەشنووس");
});

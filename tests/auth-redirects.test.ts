import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthCallbackUrl,
  getSafeAuthNextPath,
} from "../lib/auth-redirects.ts";

test("safe callback paths preserve query parameters for password recovery", () => {
  assert.equal(
    getSafeAuthNextPath("/reset-password?mode=update"),
    "/reset-password?mode=update",
  );
});

test("safe callback paths accept normal in-app destinations", () => {
  assert.equal(getSafeAuthNextPath("/dashboard/orders"), "/dashboard/orders");
  assert.equal(getSafeAuthNextPath("/dashboard?tab=profile"), "/dashboard?tab=profile");
});

test("absolute, protocol-relative, backslash and normalized network paths are rejected", () => {
  assert.equal(getSafeAuthNextPath("https://attacker.example"), "/dashboard");
  assert.equal(getSafeAuthNextPath("//attacker.example"), "/dashboard");
  assert.equal(getSafeAuthNextPath("/\\\\attacker.example"), "/dashboard");
  assert.equal(getSafeAuthNextPath("/..//attacker.example"), "/dashboard");
});

test("callback URL encodes the next path as a single query parameter", () => {
  const value = buildAuthCallbackUrl(
    "https://daim-post.online",
    "/reset-password?mode=update",
  );
  const parsed = new URL(value);

  assert.equal(parsed.origin, "https://daim-post.online");
  assert.equal(parsed.pathname, "/auth/callback");
  assert.equal(parsed.searchParams.get("next"), "/reset-password?mode=update");
});

import assert from "node:assert/strict";
import test from "node:test";
import { getSecurityHeaders } from "../lib/security-headers.ts";

function headerValue(headers: ReturnType<typeof getSecurityHeaders>, name: string) {
  return headers.find((header) => header.key.toLowerCase() === name.toLowerCase())?.value;
}

test("baseline security headers prevent MIME sniffing and framing", () => {
  const headers = getSecurityHeaders(false);

  assert.equal(headerValue(headers, "X-Content-Type-Options"), "nosniff");
  assert.equal(headerValue(headers, "X-Frame-Options"), "DENY");
});

test("referrer and browser feature policies use restrictive defaults", () => {
  const headers = getSecurityHeaders(false);

  assert.equal(headerValue(headers, "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headerValue(headers, "Permissions-Policy"), "camera=(), microphone=()");
  assert.equal(headerValue(headers, "X-Permitted-Cross-Domain-Policies"), "none");
});

test("HSTS is enabled in production and omitted from development", () => {
  const developmentHeaders = getSecurityHeaders(false);
  const productionHeaders = getSecurityHeaders(true);

  assert.equal(headerValue(developmentHeaders, "Strict-Transport-Security"), undefined);
  assert.equal(
    headerValue(productionHeaders, "Strict-Transport-Security"),
    "max-age=31536000",
  );
});

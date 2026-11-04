import assert from "node:assert/strict";
import test from "node:test";
import {
  getActorLabel,
  getAddressLine,
  getDeliveryStatusLabel,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getSafeSnapshotText,
  getStoreStatusLabel,
  readAddressSnapshot,
} from "../lib/order-tracking.ts";

test("customer-facing order statuses have Sorani labels", () => {
  assert.equal(getOrderStatusLabel("placed"), "داواکاری تۆمارکراوە");
  assert.equal(getOrderStatusLabel("out_for_delivery"), "لە ڕێگای گەیاندندایە");
  assert.equal(getOrderStatusLabel("delivered"), "داواکاری گەیشتووە");
});

test("merchant and delivery status labels cover each workflow state", () => {
  assert.equal(getStoreStatusLabel("ready_for_pickup"), "ئامادەی کاپتنە");
  assert.equal(getDeliveryStatusLabel("awaiting_captain"), "چاوەڕێی کاپتن");
  assert.equal(getDeliveryStatusLabel("on_the_way"), "لە ڕێگادایە");
});

test("payment method status is distinguished from order fulfillment state", () => {
  assert.equal(getPaymentStatusLabel("pending"), "پارە لە کاتی گەیاندندا دەدرێت");
});

test("actor roles are presented as customer-facing labels only", () => {
  assert.equal(getActorLabel("captain"), "کاپتنی گەیاندن");
  assert.equal(getActorLabel("super_admin"), "سوپەرئەدمین");
  assert.equal(getActorLabel(null), "سیستەم");
});

test("address snapshots are safely read from JSON objects", () => {
  assert.deepEqual(readAddressSnapshot(null), {});
  assert.deepEqual(readAddressSnapshot(["not", "an", "object"]), {});
  assert.equal(
    getAddressLine({ address_line: "شەقامی سەرەکی", district: "ناوەندی", city: "بەردەڕەش" }),
    "شەقامی سەرەکی، ناوەندی، بەردەڕەش",
  );
});

test("missing or malformed address fields are omitted", () => {
  assert.equal(getAddressLine({ address_line: "شار", district: "", city: null }), "شار");
  assert.equal(getAddressLine({}), "");
});

test("safe snapshot text ignores empty and non-string values", () => {
  assert.equal(getSafeSnapshotText("  بەردەڕەش "), "بەردەڕەش");
  assert.equal(getSafeSnapshotText("   "), null);
  assert.equal(getSafeSnapshotText(123), null);
});

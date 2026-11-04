import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateParentOrderStatus,
  getCaptainDeliveryAction,
  getMerchantOrderAction,
} from "../lib/order-workflow-rules.ts";

test("merchant transitions are strictly sequential", () => {
  assert.equal(getMerchantOrderAction("placed")?.nextStatus, "accepted");
  assert.equal(getMerchantOrderAction("accepted")?.nextStatus, "preparing");
  assert.equal(getMerchantOrderAction("preparing")?.nextStatus, "ready_for_pickup");
});

test("merchant cannot advance terminal or unknown states", () => {
  assert.equal(getMerchantOrderAction("ready_for_pickup"), null);
  assert.equal(getMerchantOrderAction("cancelled"), null);
  assert.equal(getMerchantOrderAction("delivered"), null);
  assert.equal(getMerchantOrderAction("invalid"), null);
});

test("captain transitions follow assignment, pickup and delivery sequence", () => {
  assert.equal(getCaptainDeliveryAction("assigned")?.nextStatus, "accepted");
  assert.equal(getCaptainDeliveryAction("accepted")?.nextStatus, "picked_up");
  assert.equal(getCaptainDeliveryAction("picked_up")?.nextStatus, "on_the_way");
  assert.equal(getCaptainDeliveryAction("on_the_way")?.nextStatus, "delivered");
});

test("captain cannot change unassigned, delivered, cancelled or unknown states", () => {
  assert.equal(getCaptainDeliveryAction("awaiting_captain"), null);
  assert.equal(getCaptainDeliveryAction("delivered"), null);
  assert.equal(getCaptainDeliveryAction("cancelled"), null);
  assert.equal(getCaptainDeliveryAction("invalid"), null);
});

test("parent order waits until each store is ready", () => {
  assert.equal(aggregateParentOrderStatus(["ready_for_pickup", "preparing"]), "partially_ready");
  assert.equal(aggregateParentOrderStatus(["ready_for_pickup", "ready_for_pickup"]), "ready_for_pickup");
});

test("parent order reflects preparation and acceptance", () => {
  assert.equal(aggregateParentOrderStatus(["accepted", "placed"]), "accepted");
  assert.equal(aggregateParentOrderStatus(["preparing", "accepted"]), "preparing");
});

test("parent order moves to delivery when any store has been picked up", () => {
  assert.equal(aggregateParentOrderStatus(["picked_up", "ready_for_pickup"]), "out_for_delivery");
  assert.equal(aggregateParentOrderStatus(["delivered", "picked_up"]), "out_for_delivery");
});

test("parent order is delivered only when all stores are delivered", () => {
  assert.equal(aggregateParentOrderStatus(["delivered", "delivered"]), "delivered");
  assert.equal(aggregateParentOrderStatus(["delivered", "ready_for_pickup"]), "out_for_delivery");
});

test("parent order is cancelled only when every store is cancelled", () => {
  assert.equal(aggregateParentOrderStatus(["cancelled", "cancelled"]), "cancelled");
  assert.equal(aggregateParentOrderStatus(["cancelled", "delivered"]), "out_for_delivery");
});

export type CodConsignment = {
  id: string;
  createdAt: string;
  itemsSubtotalIqd: number;
};

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

/**
 * Splits one order-level delivery fee across its store consignments.
 * Every consignment except the final one receives a rounded proportional
 * share; the final consignment receives the remainder to preserve the total.
 * This mirrors the database RPC allocation algorithm.
 */
export function getCodDeliveryFeeShare(
  deliveryFeeIqd: number,
  orderItemsSubtotalIqd: number,
  consignments: CodConsignment[],
  consignmentId: string,
): number | null {
  assertNonNegativeInteger(deliveryFeeIqd, "deliveryFeeIqd");
  assertNonNegativeInteger(orderItemsSubtotalIqd, "orderItemsSubtotalIqd");

  const ordered = [...consignments].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const targetIndex = ordered.findIndex((item) => item.id === consignmentId);
  if (targetIndex < 0) return null;

  let allocated = 0;
  for (let index = 0; index <= targetIndex; index += 1) {
    const item = ordered[index];
    assertNonNegativeInteger(item.itemsSubtotalIqd, "itemsSubtotalIqd");
    const isLast = index === ordered.length - 1;
    const share = isLast
      ? deliveryFeeIqd - allocated
      : orderItemsSubtotalIqd > 0
        ? Math.round((deliveryFeeIqd * item.itemsSubtotalIqd) / orderItemsSubtotalIqd)
        : 0;
    if (index === targetIndex) return share;
    allocated += share;
  }

  return null;
}

export type MerchantOrderStatus =
  | "placed" | "accepted" | "preparing" | "ready_for_pickup"
  | "picked_up" | "delivered" | "cancelled";

export type DeliveryAssignmentStatus =
  | "awaiting_captain" | "assigned" | "accepted" | "picked_up"
  | "on_the_way" | "delivered" | "cancelled";

export type ParentOrderStatus =
  | "placed" | "accepted" | "preparing" | "partially_ready"
  | "ready_for_pickup" | "out_for_delivery" | "delivered" | "cancelled";

export type WorkflowAction = { nextStatus: string; label: string } | null;

const merchantActions: Record<string, WorkflowAction> = {
  placed: { nextStatus: "accepted", label: "وەرگرتنی داواکاری" },
  accepted: { nextStatus: "preparing", label: "دەستپێکردنی ئامادەکردن" },
  preparing: { nextStatus: "ready_for_pickup", label: "ئامادەی کاپتنە" },
};

const captainActions: Record<string, WorkflowAction> = {
  assigned: { nextStatus: "accepted", label: "پەسەندکردنی گەیاندن" },
  accepted: { nextStatus: "picked_up", label: "وەرگرتنی داواکاری" },
  picked_up: { nextStatus: "on_the_way", label: "دەستپێکردنی گەیاندن" },
  on_the_way: { nextStatus: "delivered", label: "گەیاندن تەواو بوو" },
};

export function getMerchantOrderAction(status: string): WorkflowAction {
  return merchantActions[status] ?? null;
}

export function getCaptainDeliveryAction(status: string): WorkflowAction {
  return captainActions[status] ?? null;
}

export function aggregateParentOrderStatus(statuses: readonly string[]): ParentOrderStatus {
  if (statuses.length === 0) return "placed";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.some((status) => status === "picked_up" || status === "delivered")) {
    return "out_for_delivery";
  }
  if (statuses.every((status) => status === "ready_for_pickup")) return "ready_for_pickup";
  if (statuses.some((status) => status === "ready_for_pickup")) return "partially_ready";
  if (statuses.some((status) => status === "preparing")) return "preparing";
  if (statuses.some((status) => status === "accepted")) return "accepted";
  return "placed";
}

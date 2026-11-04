export type AddressSnapshot = Record<string, unknown>;

const orderStatusLabels: Record<string, string> = {
  pending_payment: "چاوەڕێی پارەدان",
  placed: "داواکاری تۆمارکراوە",
  accepted: "داواکاری پەسەندکراوە",
  preparing: "کاڵاکان ئامادە دەکرێن",
  partially_ready: "بەشێک لە داواکاری ئامادەیە",
  ready_for_pickup: "ئامادەی وەرگرتنە",
  out_for_delivery: "لە ڕێگای گەیاندندایە",
  delivered: "داواکاری گەیشتووە",
  cancelled: "داواکاری هەڵوەشێنراوەتەوە",
  payment_failed: "پارەدان سەرکەوتوو نەبوو",
  refund_requested: "داواکاری گەڕاندنەوەی پارە",
  refunded: "پارە گەڕێندرایەوە",
};

const storeStatusLabels: Record<string, string> = {
  placed: "داواکاری نوێ",
  accepted: "پەسەندکراوە",
  preparing: "ئامادە دەکرێت",
  ready_for_pickup: "ئامادەی کاپتنە",
  picked_up: "لە کاپتن وەرگیراوە",
  delivered: "گەیشتووە",
  cancelled: "هەڵوەشێنراوەتەوە",
};

const deliveryStatusLabels: Record<string, string> = {
  awaiting_captain: "چاوەڕێی کاپتن",
  assigned: "کاپتن دیاریکراوە",
  accepted: "کاپتن گەیاندنی پەسەند کردووە",
  picked_up: "داواکاری وەرگیراوە",
  on_the_way: "لە ڕێگادایە",
  delivered: "گەیەنراوە",
  cancelled: "گەیاندن هەڵوەشێنراوەتەوە",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "پارە لە کاتی گەیاندندا دەدرێت",
  paid: "پارە دراوە",
  partially_refunded: "بەشێک لە پارە گەڕێندرایەوە",
  failed: "پارەدان سەرکەوتوو نەبوو",
  refunded: "پارە گەڕێندرایەوە",
};

const actorLabels: Record<string, string> = {
  restaurant: "فرۆشگا",
  supermarket: "فرۆشگا",
  produce_vendor: "فرۆشگا",
  meat_seafood_vendor: "فرۆشگا",
  captain: "کاپتنی گەیاندن",
  admin: "بەڕێوەبەر",
  super_admin: "سوپەرئەدمین",
  customer: "کڕیار",
};

export function getOrderStatusLabel(status: string): string {
  return orderStatusLabels[status] ?? status;
}

export function getStoreStatusLabel(status: string): string {
  return storeStatusLabels[status] ?? status;
}

export function getDeliveryStatusLabel(status: string): string {
  return deliveryStatusLabels[status] ?? status;
}

export function getEventStatusLabel(status: string, actorRole: string | null): string {
  if (status === "assigned" || actorRole === "captain") {
    return deliveryStatusLabels[status] ?? getOrderStatusLabel(status);
  }

  if (
    actorRole === "restaurant" ||
    actorRole === "supermarket" ||
    actorRole === "produce_vendor" ||
    actorRole === "meat_seafood_vendor"
  ) {
    return storeStatusLabels[status] ?? getOrderStatusLabel(status);
  }

  return getOrderStatusLabel(status);
}

export function getPaymentStatusLabel(status: string): string {
  return paymentStatusLabels[status] ?? status;
}

export function getActorLabel(role: string | null): string {
  if (!role) return "سیستەم";
  return actorLabels[role] ?? "سیستەم";
}

export function readAddressSnapshot(value: unknown): AddressSnapshot {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as AddressSnapshot;
  }
  return {};
}

export function getAddressLine(value: unknown): string {
  const address = readAddressSnapshot(value);
  return ["address_line", "district", "city"]
    .map((key) => address[key])
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join("، ");
}

export function getSafeSnapshotText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

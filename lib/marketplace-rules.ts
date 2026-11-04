export type DeliveryZoneRule = {
  id?: string;
  city: string;
  district: string | null;
  is_active: boolean;
  base_fee_iqd: number;
  minimum_fee_iqd: number;
  maximum_fee_iqd: number | null;
  per_km_fee_iqd: number;
};

export type ProductOrderRules = {
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
  quantityStep: number;
};

export type CartLineRule = {
  productId: string;
  unit: string;
  unitPriceIqd: number;
  stockQuantity: number | null;
  quantity: number;
  minOrderQuantity?: number;
  maxOrderQuantity?: number | null;
  quantityStep?: number;
};

export function supportsFractionalQuantity(unit: string): boolean {
  return unit === "kg" || unit === "liter";
}

export function getUnitLabelCkb(unit: string): string {
  const labels: Record<string, string> = {
    kg: "کیلۆگرام",
    g: "گرام",
    liter: "لیتر",
    ml: "ملی‌لیتر",
    piece: "دانە",
    pack: "پاکەت",
    bottle: "بوتڵ",
    box: "کارتۆن",
    dozen: "دەستە (١٢ دانە)",
  };
  return labels[unit] ?? unit;
}

export function getDefaultOrderRules(unit: string): ProductOrderRules {
  if (unit === "kg" || unit === "liter") {
    return { minOrderQuantity: 0.25, maxOrderQuantity: null, quantityStep: 0.05 };
  }
  if (unit === "g" || unit === "ml") {
    return { minOrderQuantity: 100, maxOrderQuantity: null, quantityStep: 50 };
  }
  return { minOrderQuantity: 1, maxOrderQuantity: null, quantityStep: 1 };
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function normalizeCartQuantity(
  unit: string,
  requested: number,
  stockQuantity: number | null,
  minOrderQuantity = getDefaultOrderRules(unit).minOrderQuantity,
  maxOrderQuantity = getDefaultOrderRules(unit).maxOrderQuantity,
  quantityStep = getDefaultOrderRules(unit).quantityStep,
): number | null {
  if (!Number.isFinite(requested) || requested <= 0) return null;
  if (!Number.isFinite(minOrderQuantity) || minOrderQuantity <= 0) return null;
  if (!Number.isFinite(quantityStep) || quantityStep <= 0) return null;
  if (maxOrderQuantity !== null && (!Number.isFinite(maxOrderQuantity) || maxOrderQuantity < minOrderQuantity)) return null;
  if (stockQuantity !== null && (!Number.isFinite(stockQuantity) || stockQuantity < 0)) return null;

  let upperLimit = stockQuantity;
  if (maxOrderQuantity !== null) {
    upperLimit = upperLimit === null ? maxOrderQuantity : Math.min(upperLimit, maxOrderQuantity);
  }
  if (upperLimit !== null && upperLimit < minOrderQuantity) return null;

  const wholeOnly = !supportsFractionalQuantity(unit);
  const safeRequested = wholeOnly ? Math.floor(requested) : requested;
  const steps = Math.round((safeRequested - minOrderQuantity) / quantityStep);
  let normalized = roundQuantity(minOrderQuantity + steps * quantityStep);

  if (normalized < minOrderQuantity) return null;
  if (upperLimit !== null && normalized > upperLimit) {
    const maxSteps = Math.floor((upperLimit - minOrderQuantity + 1e-9) / quantityStep);
    normalized = roundQuantity(minOrderQuantity + maxSteps * quantityStep);
  }
  if (normalized < minOrderQuantity || (upperLimit !== null && normalized > upperLimit)) return null;
  if (wholeOnly && normalized !== Math.trunc(normalized)) return null;
  return normalized;
}

export function isValidCartLine(value: unknown): value is CartLineRule {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.productId === "string"
    && item.productId.length > 0
    && typeof item.unit === "string"
    && item.unit.length > 0
    && typeof item.unitPriceIqd === "number"
    && Number.isFinite(item.unitPriceIqd)
    && item.unitPriceIqd >= 0
    && (item.stockQuantity === null
      || (typeof item.stockQuantity === "number"
        && Number.isFinite(item.stockQuantity)
        && item.stockQuantity >= 0))
    && (item.minOrderQuantity === undefined
      || (typeof item.minOrderQuantity === "number" && Number.isFinite(item.minOrderQuantity) && item.minOrderQuantity > 0))
    && (item.maxOrderQuantity === undefined || item.maxOrderQuantity === null
      || (typeof item.maxOrderQuantity === "number" && Number.isFinite(item.maxOrderQuantity) && item.maxOrderQuantity > 0))
    && (item.quantityStep === undefined
      || (typeof item.quantityStep === "number" && Number.isFinite(item.quantityStep) && item.quantityStep > 0))
    && typeof item.quantity === "number"
    && Number.isFinite(item.quantity)
    && item.quantity > 0;
}

function normalizeLocation(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function resolveDeliveryZone<T extends DeliveryZoneRule>(
  zones: readonly T[],
  city: string,
  district: string,
): T | null {
  const normalizedCity = normalizeLocation(city);
  const normalizedDistrict = normalizeLocation(district);
  if (!normalizedCity || !normalizedDistrict) return null;

  const candidates = zones.filter((zone) =>
    zone.is_active && normalizeLocation(zone.city) === normalizedCity
    && (zone.district === null || normalizeLocation(zone.district) === normalizedDistrict)
  );

  candidates.sort((left, right) => {
    if (left.district === null && right.district !== null) return 1;
    if (left.district !== null && right.district === null) return -1;
    return 0;
  });

  return candidates[0] ?? null;
}

export function calculateFlatDeliveryFee(zone: DeliveryZoneRule | null): number | null {
  if (!zone || !zone.is_active || zone.per_km_fee_iqd !== 0) return null;

  const amounts = [zone.base_fee_iqd, zone.minimum_fee_iqd];
  if (!amounts.every((amount) => Number.isSafeInteger(amount) && amount >= 0)) return null;

  if (
    zone.maximum_fee_iqd !== null
    && (!Number.isSafeInteger(zone.maximum_fee_iqd)
      || zone.maximum_fee_iqd < zone.minimum_fee_iqd)
  ) return null;

  const uncapped = Math.max(zone.base_fee_iqd, zone.minimum_fee_iqd);
  return zone.maximum_fee_iqd === null
    ? uncapped
    : Math.min(uncapped, zone.maximum_fee_iqd);
}

export function calculateCartSubtotal(
  items: readonly Pick<CartLineRule, "unitPriceIqd" | "quantity">[],
): number {
  return items.reduce((sum, item) => {
    if (
      !Number.isFinite(item.unitPriceIqd)
      || item.unitPriceIqd < 0
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
    ) return sum;
    return sum + Math.round(item.unitPriceIqd * item.quantity);
  }, 0);
}

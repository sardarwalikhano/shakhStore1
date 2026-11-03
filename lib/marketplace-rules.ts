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

export type CartLineRule = {
  productId: string;
  unit: string;
  unitPriceIqd: number;
  stockQuantity: number | null;
  quantity: number;
};

export function supportsFractionalQuantity(unit: string): boolean {
  return unit === "kg" || unit === "liter";
}

export function normalizeCartQuantity(
  unit: string,
  requested: number,
  stockQuantity: number | null,
): number | null {
  if (!Number.isFinite(requested) || requested <= 0) return null;
  if (
    stockQuantity !== null
    && (!Number.isSafeInteger(stockQuantity) || stockQuantity <= 0)
  ) return null;

  const normalized = supportsFractionalQuantity(unit)
    ? Math.round(requested * 100) / 100
    : Math.floor(requested);

  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return stockQuantity === null ? normalized : Math.min(normalized, stockQuantity);
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
        && Number.isSafeInteger(item.stockQuantity)
        && item.stockQuantity >= 0))
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

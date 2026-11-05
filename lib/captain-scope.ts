export type CaptainScopeRule = {
  scope_type: string;
  is_active: boolean;
  email_confirmed: boolean;
  zone_ids: readonly string[] | null;
};

/**
 * Determines whether a captain may be selected for a delivery in one zone.
 * The database trigger independently enforces the same restriction.
 */
export function isCaptainEligibleForZone(
  captain: CaptainScopeRule,
  zoneId: string | null,
): boolean {
  if (!captain.is_active || !captain.email_confirmed) return false;
  if (captain.scope_type === "global") return true;
  if (captain.scope_type !== "zones" || !zoneId) return false;
  return Array.isArray(captain.zone_ids) && captain.zone_ids.includes(zoneId);
}

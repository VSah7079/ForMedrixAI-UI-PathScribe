// src/services/abnormalDetection/resolveAbnormalDetectionEnabled.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-105. Real, per direct guidance: "I'd like a system setting to
// enable or disable this capability. At both the Enterprise and
// performing facility level. If the enterprise level is disabled then
// the performing facility level is disabled and cannot be overridden."
//
// Deliberately NOT SystemConfigContext.tsx's existing isFeatureEnabled()
// helper — that resolves hospitalVal ?? enterpriseVal ?? false, meaning
// a facility-level value always wins over the enterprise one, in
// EITHER direction. That's the right rule for reportingPlusEnabled (a
// facility should be free to turn a nice-to-have on or off for itself
// regardless of the enterprise default) but it is the WRONG rule here:
// it would let a facility silently re-enable a capability an
// enterprise admin deliberately, explicitly turned off. This is a
// real, separate governance rule: enterprise OFF is an absolute floor
// no facility setting can raise back up; a facility can only ever
// further restrict a permissive enterprise default, never loosen it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param enterpriseEnabled - EnterpriseFeatures.abnormalDetectionEnabled
 *   (types/config/EnterpriseConfig.ts), resolved via useSystemConfig().
 * @param facilityEnabled - Facility.abnormalDetectionEnabled
 *   (services/facilities/IFacilityService.ts) for the case's real
 *   performing lab. undefined = this facility has no explicit
 *   override, follow the enterprise default.
 */
export function resolveAbnormalDetectionEnabled(
  enterpriseEnabled: boolean,
  facilityEnabled: boolean | undefined
): boolean {
  // Real, absolute floor — no facility setting can override this,
  // regardless of its own value.
  if (!enterpriseEnabled) return false;
  // Enterprise permits it — the facility's own explicit choice
  // applies if set, otherwise it inherits the (permissive) enterprise
  // default.
  return facilityEnabled ?? enterpriseEnabled;
}

// src/services/cytology/resolveEffectiveCytologyRoutingSettings.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, pure resolution — the effective Cytology routing settings a
// given performing facility actually sees, per direct correction: "the
// non gyn cytology is an enterprise and performing facility decision."
// Most specific wins: facility override > Enterprise default. Same
// real "resolve at the call site, pass already-loaded data in" posture
// as resolveEffectiveCytologyQcSettings (PS-157) — a plain function,
// not a service method — deliberately two-tier, not three: direct
// guidance names only Enterprise and performing Facility here, never
// an individual staff member.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyRoutingSettingsConfig } from './ICytologyRoutingSettingsService';
import type { FacilityCytologyRoutingOverride } from './IFacilityCytologyRoutingOverrideService';

export function resolveEffectiveCytologyRoutingSettings(
  enterpriseDefault: CytologyRoutingSettingsConfig,
  facilityOverride: FacilityCytologyRoutingOverride | null,
): CytologyRoutingSettingsConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
  };
}

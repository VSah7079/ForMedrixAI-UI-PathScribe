// src/services/cytology/resolveEffectiveCytologyQcSettings.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, pure resolution — the effective Cytology QC settings a given
// staff member, at a given facility, actually sees, per direct
// guidance: "enterprise setting on the % random qc, followed by
// performing facility override and then Staff Member override." Most
// specific wins: staff override > facility override > Enterprise
// default. Same real "resolve at the call site, pass already-loaded
// data in" posture as resolveEffectivePrintSettings — a plain
// function, not a service method, so any real consumer (this admin
// screen, and eventually the real QC-case-selection mechanism itself)
// can reuse the exact same merge without re-implementing it.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyQcSettingsConfig } from './ICytologyQcSettingsService';
import type { FacilityCytologyQcOverride } from './IFacilityCytologyQcOverrideService';
import type { StaffCytologyQcOverride } from './IStaffCytologyQcOverrideService';

export function resolveEffectiveCytologyQcSettings(
  enterpriseDefault: CytologyQcSettingsConfig,
  facilityOverride: FacilityCytologyQcOverride | null,
  staffOverride: StaffCytologyQcOverride | null,
): CytologyQcSettingsConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
    ...(staffOverride?.overrides ?? {}),
  };
}

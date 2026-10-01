// src/services/cytology/resolveEffectiveCytologyWorkloadCap.ts
// Real, pure resolution — mirrors resolveEffectiveCytologyQcSettings.ts's
// own established 3-tier cascade exactly: staff override > facility
// override > Enterprise default. Real, per direct guidance: "make it
// universal but configurable at the enterprise, facility and staff
// level."
import type { CytologyWorkloadCapSettingsConfig } from './ICytologyWorkloadCapSettingsService';
import type { FacilityCytologyWorkloadCapOverride } from './IFacilityCytologyWorkloadCapOverrideService';
import type { StaffCytologyWorkloadCapOverride } from './IStaffCytologyWorkloadCapOverrideService';

export function resolveEffectiveCytologyWorkloadCap(
  enterpriseDefault: CytologyWorkloadCapSettingsConfig,
  facilityOverride: FacilityCytologyWorkloadCapOverride | null,
  staffOverride: StaffCytologyWorkloadCapOverride | null,
): CytologyWorkloadCapSettingsConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
    ...(staffOverride?.overrides ?? {}),
  };
}

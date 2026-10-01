// src/services/cytology/resolveEffectiveCytologyRegistrySettings.ts
// Real, pure resolution — mirrors this module's own established
// two-tier cascade resolvers exactly.
import type { CytologyRegistrySettingsConfig } from './ICytologyRegistrySettingsService';
import type { FacilityCytologyRegistryOverride } from './IFacilityCytologyRegistryOverrideService';

export function resolveEffectiveCytologyRegistrySettings(
  enterpriseDefault: CytologyRegistrySettingsConfig,
  facilityOverride: FacilityCytologyRegistryOverride | null,
): CytologyRegistrySettingsConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
  };
}

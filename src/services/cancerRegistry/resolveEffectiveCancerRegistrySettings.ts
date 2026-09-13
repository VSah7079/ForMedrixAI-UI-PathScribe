// src/services/cancerRegistry/resolveEffectiveCancerRegistrySettings.ts
// Real, pure resolution — mirrors resolveEffectiveCytologyRegistrySettings.ts exactly.
import type { CancerRegistrySettingsConfig } from './ICancerRegistrySettingsService';
import type { FacilityCancerRegistryOverride } from './IFacilityCancerRegistryOverrideService';

export function resolveEffectiveCancerRegistrySettings(
  enterpriseDefault: CancerRegistrySettingsConfig,
  facilityOverride: FacilityCancerRegistryOverride | null,
): CancerRegistrySettingsConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
  };
}

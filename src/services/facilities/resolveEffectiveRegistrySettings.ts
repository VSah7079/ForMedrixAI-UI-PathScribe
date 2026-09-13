// src/services/facilities/resolveEffectiveRegistrySettings.ts
// Real, pure resolution — mirrors this module's own established
// two-tier cascade resolvers exactly (e.g. resolveEffectiveCytologyQcSettings.ts).
import type { RegistrySettingsConfig } from './IRegistrySettingsService';
import type { FacilityRegistryOverride } from './IFacilityRegistryOverrideService';

export function resolveEffectiveRegistrySettings(
  enterpriseDefault: RegistrySettingsConfig,
  facilityOverride: FacilityRegistryOverride | null,
): RegistrySettingsConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
  };
}

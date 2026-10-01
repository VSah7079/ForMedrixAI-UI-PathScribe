// src/services/cytology/resolveEffectiveCytologyNomenclatureSettings.ts
// Real, pure resolution — mirrors resolveEffectiveCytologyRoutingSettings.ts
// (PS-158) exactly: facility override wins over the Enterprise default.
import type { CytologyNomenclatureSettingsConfig } from './ICytologyNomenclatureSettingsService';
import type { FacilityCytologyNomenclatureOverride } from './IFacilityCytologyNomenclatureOverrideService';

export function resolveEffectiveCytologyNomenclatureSettings(
  enterpriseDefault: CytologyNomenclatureSettingsConfig,
  facilityOverride: FacilityCytologyNomenclatureOverride | null,
): CytologyNomenclatureSettingsConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
  };
}

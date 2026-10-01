// src/services/cytology/resolveEffectiveCytologyScreeningStrategy.ts
// Real, pure resolution — mirrors this phase's own
// resolveEffectiveCytologyNomenclatureSettings.ts exactly.
import type { CytologyScreeningStrategyConfig } from './ICytologyScreeningStrategyService';
import type { FacilityCytologyScreeningStrategyOverride } from './IFacilityCytologyScreeningStrategyOverrideService';

export function resolveEffectiveCytologyScreeningStrategy(
  enterpriseDefault: CytologyScreeningStrategyConfig,
  facilityOverride: FacilityCytologyScreeningStrategyOverride | null,
): CytologyScreeningStrategyConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
  };
}

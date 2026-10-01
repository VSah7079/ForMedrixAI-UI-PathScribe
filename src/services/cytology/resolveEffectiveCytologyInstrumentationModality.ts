// src/services/cytology/resolveEffectiveCytologyInstrumentationModality.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, pure resolution — mirrors resolveEffectiveCytologyNomenclatureSettings.ts
// exactly: facility override wins over the Enterprise default. The one
// real, per-case entry point that decides whether a given case's own
// WSI viewer action is offered — resolved from THAT case's own
// performing facility, never a flat, app-wide read.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyInstrumentationConfig } from './ICytologyInstrumentationService';
import type { FacilityCytologyInstrumentationOverride } from './IFacilityCytologyInstrumentationOverrideService';

export function resolveEffectiveCytologyInstrumentationModality(
  enterpriseDefault: CytologyInstrumentationConfig,
  facilityOverride: FacilityCytologyInstrumentationOverride | null,
): CytologyInstrumentationConfig {
  return {
    ...enterpriseDefault,
    ...(facilityOverride?.overrides ?? {}),
  };
}

// src/services/cytology/ICytologyScreeningStrategyService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own international roadmap: "Primary
// hrHPV First (With Reflex Cytology): UK, Scotland, Ireland,
// Netherlands, Australia, New Zealand, Germany, and France... the
// cytology laboratory rarely sees a slide unless the automated
// molecular platform detects high-risk HPV first... slides are
// generated and routed to cytotechnologists only after a positive
// hrHPV result." vs. "Co-Testing & Mixed Models: United States,
// Canada, and South Korea... simultaneous Pap + HPV."
//
// Real, two-tier cascade — same shape as PS-158's routing settings and
// this phase's own nomenclature settings: a facility's real screening
// strategy is a real, facility-level operational choice, not a
// Staff-level one.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

/** 'co_testing': cytology and HPV are performed together — this app's
 *  own original, real workflow (PS-149 onward): a slide always exists
 *  and gets screened regardless of the HPV result, which is recorded
 *  alongside it (PS-172). 'primary_hpv_reflex': HPV is tested FIRST;
 *  a cytology slide is only ever made — "reflexed" — once that real
 *  result comes back positive. Negative means routine recall with no
 *  cytology screening at all. */
export type CytologyScreeningStrategy = 'co_testing' | 'primary_hpv_reflex';

export interface CytologyScreeningStrategyConfig {
  screeningStrategy: CytologyScreeningStrategy;
}

/** Real, per direct guidance: co-testing remains this app's own real,
 *  original default (US, Canada, South Korea) — never silently
 *  assumed correct for every real lab, but the right default until a
 *  facility's own override says otherwise. */
export const DEFAULT_CYTOLOGY_SCREENING_STRATEGY: CytologyScreeningStrategyConfig = {
  screeningStrategy: 'co_testing',
};

export interface ICytologyScreeningStrategyService {
  get(): Promise<ServiceResult<CytologyScreeningStrategyConfig>>;
  update(patch: Partial<CytologyScreeningStrategyConfig>): Promise<ServiceResult<CytologyScreeningStrategyConfig>>;
  reset(): Promise<ServiceResult<CytologyScreeningStrategyConfig>>;
}

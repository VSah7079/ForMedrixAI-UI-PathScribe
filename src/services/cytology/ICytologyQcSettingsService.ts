// src/services/cytology/ICytologyQcSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct guidance: "there is an enterprise setting on
// the % random qc, followed by performing facility override and then
// Staff Member override. This gives us the flexibility to assign
// higher rates of QC for new employees or students." Real, confirmed
// Tier 1 (Enterprise-wide default) — the same real, established
// 3-source-of-truth settings-cascade pattern this app already uses for
// print settings (IPrintSettingsService.ts is Tier 1's own direct
// template; IFacilityPrintSettingsService.ts is Tier 2's), extended
// here with a genuine Tier 3 (per-staff-member override) neither of
// those needed.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export interface CytologyQcSettingsConfig {
  /** Real, per direct correction: "The Cytology System follows two
   *  types: 1. Cytology GYN Results that are Negative - x% of
   *  negative cases are sent to Cytology QC pool. 2. Cytology GYN
   *  Non Negatives, x% of those get sent to the Cytology QC pool" —
   *  two real, genuinely independent rates, not one shared rate. This
   *  one: the % of NEGATIVE (NILM-tier) primary screens randomly
   *  selected for QC rescreening — the real, standard US CAP/CLIA
   *  baseline this app's own Phase 3/6 work already assumed (10). */
  negativeRandomSelectionRatePercent: number;
  /** The % of NON-NEGATIVE (genuinely abnormal — the same real
   *  requiresPathologistReview: true signal this module already
   *  computes) primary screens randomly selected for QC rescreening.
   *  Real, deliberately independent from the negative rate above —
   *  a lab can and often does run these at different real rates. */
  nonNegativeRandomSelectionRatePercent: number;
}

export const DEFAULT_CYTOLOGY_QC_SETTINGS: CytologyQcSettingsConfig = {
  negativeRandomSelectionRatePercent: 10,
  nonNegativeRandomSelectionRatePercent: 10,
};

export interface ICytologyQcSettingsService {
  get(): Promise<ServiceResult<CytologyQcSettingsConfig>>;
  update(patch: Partial<CytologyQcSettingsConfig>): Promise<ServiceResult<CytologyQcSettingsConfig>>;
  reset(): Promise<ServiceResult<CytologyQcSettingsConfig>>;
}

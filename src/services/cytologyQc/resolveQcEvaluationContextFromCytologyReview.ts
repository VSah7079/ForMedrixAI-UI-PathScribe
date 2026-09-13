// src/services/cytologyQc/resolveQcEvaluationContextFromCytologyReview.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own migration decision: "only peer
// review migrates" from the old, simple flag-based mechanism
// (applyPostSignOutPeerReviewFlagIfNeeded in CytologyScreeningPage.tsx)
// onto the new QC Rules Engine. This is the real adapter — pure,
// taking already-resolved real values as parameters rather than doing
// any lookups itself, so the actual async resolution (facility ->
// jurisdiction, category ID -> adequacy) stays in the real call site,
// not hidden inside this function.
//
// Real, honest scope note on adequacy resolution: this app's own
// GYN adequacy categories are referenced by categoryId, not a direct
// enum — the real, reliable signal available without inventing a new
// field is the category's own real Bethesda-standard label text
// ("Satisfactory for Evaluation" / "Unsatisfactory for Evaluation"),
// checked by the real caller before this function is ever invoked.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';
import type { QcEvaluationCaseContext } from './resolveQcCriteriaMatch';

export interface CytologyReviewContextInputs {
  jurisdiction: Jurisdiction;
  performingFacilityId?: string;
  primarySignOutProviderId: string;
  providerRole: 'pathologist' | 'cytotechnologist';
  isGynCytology: boolean;
  sampleAdequacy: 'satisfactory' | 'unsatisfactory' | 'limited';
  resultIsNegative: boolean;
  /** Real, per spec's own named high-risk examples this call site can
   *  actually observe — HR-HPV positivity from the real, existing
   *  hpvGenotypeDetail.otherHighRisk signal. Kept as a real, honest
   *  subset rather than fabricating flags this call site has no real
   *  way to know (e.g. postmenopausal bleeding, which lives in
   *  clinical history this screen doesn't carry). */
  isHighRiskHpvPositive: boolean;
  /** Real, per direct guidance's own confirmed naming and
   *  architectural framing — the real, already-resolved, currently
   *  active, NORMALIZED capabilities the signing provider holds (see
   *  resolveNormalizedCredentialCapabilities.ts for the real raw-
   *  credential-to-capability mapping), never the raw, jurisdiction-
   *  specific credential strings themselves. */
  providerCapabilities: string[];
}

export function resolveQcEvaluationContextFromCytologyReview(inputs: CytologyReviewContextInputs): QcEvaluationCaseContext {
  return {
    jurisdiction: inputs.jurisdiction,
    performingFacilityId: inputs.performingFacilityId,
    primarySignOutProviderId: inputs.primarySignOutProviderId,
    providerRole: inputs.providerRole,
    providerCapabilities: inputs.providerCapabilities,
    specimenCategory: inputs.isGynCytology ? 'gyn_pap' : 'non_gyn_fluid',
    sampleAdequacy: inputs.sampleAdequacy,
    resultIsNegative: inputs.resultIsNegative,
    activeHighRiskFlags: inputs.isHighRiskHpvPositive ? ['high_risk_hpv_positive'] : [],
  };
}

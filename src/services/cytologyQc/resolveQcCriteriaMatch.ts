// src/services/cytologyQc/resolveQcCriteriaMatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §2.1 — every criteria field is optional; an unset
// field never excludes a case, it simply isn't filtered on that
// dimension. A rule's real, effective scope is the intersection of
// every field it does set. Pure — no service calls, no randomness;
// resolveQcSamplingDecision.ts is the separate, later step that
// decides whether a criteria-matching case is actually selected.
// ─────────────────────────────────────────────────────────────────────────────

import type { QcRuleCriteria } from '@/types/cytologyQc/CytologyQcRule';
import type { Jurisdiction } from '@/types/systemConfig';

export interface QcEvaluationCaseContext {
  jurisdiction: Jurisdiction;
  performingFacilityId?: string;
  laboratoryUnitId?: string;
  satelliteSiteId?: string;
  primarySignOutProviderId: string;
  providerOnboardingStatus?: 'new_hire' | 'probationary';
  providerRole: 'pathologist' | 'cytotechnologist';
  /** Real, per direct guidance's own confirmed naming — the real,
   *  normalized system capabilities the signing provider genuinely
   *  holds (already resolved by the real caller via
   *  resolveNormalizedCredentialCapabilities.ts, which performs the
   *  real raw-credential-to-capability mapping and the real
   *  jurisdiction/expiration checks), never a raw, unfiltered
   *  credential record dump. */
  providerCapabilities: string[];
  specimenCategory: 'gyn_pap' | 'non_gyn_fluid' | 'fna';
  anatomicSite?: string;
  sampleAdequacy: 'satisfactory' | 'unsatisfactory' | 'limited';
  activeHighRiskFlags: string[];
  snomedConceptCode?: string;
  bethesdaClassification?: string;
  internalDiagnosisCode?: string;
  resultIsNegative: boolean;
  /** Real, per spec §2.2's own Consultation Deduplication guardrail —
   *  checked separately, by the caller, before this function ever
   *  runs (see resolveQcRuleEvaluation.ts) — kept out of this pure
   *  matcher since it's a whole-case exclusion, not a per-field
   *  criteria dimension. */
}

function matchesList<T>(criteriaList: T[] | undefined, actual: T | undefined): boolean {
  if (!criteriaList || criteriaList.length === 0) return true;
  return actual !== undefined && criteriaList.includes(actual);
}

function matchesAnyOverlap(criteriaList: string[] | undefined, actualList: string[]): boolean {
  if (!criteriaList || criteriaList.length === 0) return true;
  return actualList.some(f => criteriaList.includes(f));
}

function matchesBoolean(criteriaValue: boolean | undefined, actual: boolean): boolean {
  if (criteriaValue === undefined) return true;
  return criteriaValue === actual;
}

export function resolveQcCriteriaMatch(criteria: QcRuleCriteria, context: QcEvaluationCaseContext): boolean {
  return (
    matchesList(criteria.jurisdictions, context.jurisdiction) &&
    matchesList(criteria.performingFacilityIds, context.performingFacilityId) &&
    matchesList(criteria.laboratoryUnitIds, context.laboratoryUnitId) &&
    matchesList(criteria.satelliteSiteIds, context.satelliteSiteId) &&
    matchesList(criteria.primarySignOutProviderIds, context.primarySignOutProviderId) &&
    matchesList(criteria.providerOnboardingStatus, context.providerOnboardingStatus) &&
    matchesList(criteria.providerRole, context.providerRole) &&
    matchesAnyOverlap(criteria.requiredCapabilities, context.providerCapabilities) &&
    matchesList(criteria.specimenCategory, context.specimenCategory) &&
    matchesList(criteria.anatomicSite, context.anatomicSite) &&
    matchesList(criteria.sampleAdequacy, context.sampleAdequacy) &&
    matchesAnyOverlap(criteria.highRiskFlags, context.activeHighRiskFlags) &&
    matchesList(criteria.snomedConceptCodes, context.snomedConceptCode) &&
    matchesList(criteria.bethesdaClassifications, context.bethesdaClassification) &&
    matchesList(criteria.internalDiagnosisCodes, context.internalDiagnosisCode) &&
    matchesBoolean(criteria.resultIsNegative, context.resultIsNegative)
  );
}

// src/services/cytology/resolveCytologyHighRiskStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic implementing the given High-Risk Patient
// Identification Algorithm exactly: CLIA '88 § 493.1274 / CAP mandate
// a targeted rescreen of negative cases from patients at higher
// statistical risk of cervical neoplasia. Per direct guidance: "If ANY
// condition evaluates to TRUE, the specimen receives a
// IS_HIGH_RISK = TRUE flag" — a simple, real disjunction across all
// eight given criteria (CytologyHighRiskFactors, types/cytology/).
//
// Deliberately returns the real, specific triggers, not just a bare
// boolean — same "explain the complete picture" reasoning
// resolveCytologySignOutGate's own blockedReasons[] already uses.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyHighRiskFactors } from '@/types/cytology/CytologyHighRiskFactors';

export type CytologyHighRiskTrigger =
  | 'prior_abnormal_pap'
  | 'prior_cervical_procedure'
  | 'recent_hrhpv_positive'
  | 'hpv_high_risk_genotype'
  | 'immunocompromised'
  | 'in_utero_des_exposure'
  | 'abnormal_bleeding_pattern'
  | 'abnormal_exam_findings';

export interface CytologyHighRiskResult {
  isHighRisk: boolean;
  /** Every real, triggered criterion — deliberately not just the
   *  first one found. Empty when isHighRisk is false. */
  triggers: CytologyHighRiskTrigger[];
}

export function resolveCytologyHighRiskStatus(
  factors: CytologyHighRiskFactors,
): CytologyHighRiskResult {
  const triggers: CytologyHighRiskTrigger[] = [];

  if (factors.priorAbnormalPapWithinLookback) triggers.push('prior_abnormal_pap');
  if (factors.priorCervicalProcedureOrBiopsy) triggers.push('prior_cervical_procedure');
  if (factors.recentHrHpvPositive) triggers.push('recent_hrhpv_positive');
  if (factors.hpvHighRiskGenotype) triggers.push('hpv_high_risk_genotype');
  if (factors.immunocompromised) triggers.push('immunocompromised');
  if (factors.inUteroDesExposure) triggers.push('in_utero_des_exposure');
  if (factors.abnormalBleedingPattern) triggers.push('abnormal_bleeding_pattern');
  if (factors.abnormalExamFindings) triggers.push('abnormal_exam_findings');

  return { isHighRisk: triggers.length > 0, triggers };
}

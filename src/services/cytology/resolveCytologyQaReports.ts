// src/services/cytology/resolveCytologyQaReports.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the three real, standard cytology QA
// report types, each a thin, named combination of
// resolveCytologyQaComparisonPairs.ts (which reviews to compare) and
// resolveCytologyQaAggregateReport.ts (how the comparisons summarize)
// — named here so a caller (e.g. a real QA dashboard) never has to
// remember which two roles a given real report compares.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import { resolveCytologyQaComparisonPairs } from './resolveCytologyQaComparisonPairs';
import { resolveCytologyPeerReviewComparisonPairs, type CytologySpecimenFinalDiagnosisRef } from './resolveCytologyPeerReviewComparisonPairs';
import { resolveCytologyQaAggregateReport, type CytologyQaAggregateReport } from './resolveCytologyQaAggregateReport';

/** The real, mandatory 10% random rescreening report: primary_screen
 *  (Cytotechnologist) vs. qc_random_selection. */
export function resolveCytology10PercentRandomRescreeningReport(
  reviews: CytologyReviewRecord[],
  categories: CytologyCategoryEntry[],
): CytologyQaAggregateReport {
  const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'qc_random_selection');
  return resolveCytologyQaAggregateReport(pairs, categories);
}

/** The real, directed/high-risk rescreening report: primary_screen
 *  vs. qc_targeted_high_risk — the real, separate population
 *  resolveCytologyPendingMandatoryQc.ts's own real high-risk gate
 *  feeds into. */
export function resolveCytologyDirectedHighRiskRescreeningReport(
  reviews: CytologyReviewRecord[],
  categories: CytologyCategoryEntry[],
): CytologyQaAggregateReport {
  const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'qc_targeted_high_risk');
  return resolveCytologyQaAggregateReport(pairs, categories);
}

/** The real CT vs. Pathologist correlation report: primary_screen
 *  (Cytotechnologist) vs. pathologist_review (the real, final
 *  sign-out diagnostic reviewer). */
export function resolveCytologyCtVsPathologistCorrelationReport(
  reviews: CytologyReviewRecord[],
  categories: CytologyCategoryEntry[],
): CytologyQaAggregateReport {
  const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'pathologist_review');
  return resolveCytologyQaAggregateReport(pairs, categories);
}

/** The real Post-Sign-Out Peer Review Correlation report — real,
 *  per direct follow-up ("continue to the comparison displays"): the
 *  specimen's own Final Diagnosis review (whatever real role it
 *  happens to be) vs. its real post-sign-out peer review
 *  (random-selection or targeted-high-risk). Genuinely different
 *  pairing shape from the three reports above — see
 *  resolveCytologyPeerReviewComparisonPairs.ts's own header for why a
 *  fixed-role pairing can't express this real comparison. */
export function resolveCytologyPostSignOutPeerReviewCorrelationReport(
  reviews: CytologyReviewRecord[],
  specimenFinalDiagnoses: CytologySpecimenFinalDiagnosisRef[],
  categories: CytologyCategoryEntry[],
): CytologyQaAggregateReport {
  const pairs = resolveCytologyPeerReviewComparisonPairs(reviews, specimenFinalDiagnoses);
  return resolveCytologyQaAggregateReport(pairs, categories);
}

// src/services/cytology/classifyCytologyAgreement.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for the standard cytology QA diagnostic agreement
// taxonomy, per direct guidance: routine 10% rescreening, high-risk
// re-evaluations, and supervisor/pathologist peer reviews all classify
// a follow-up review against the initial/reference interpretation into
// one of four real levels:
//
//   1. Exact Agreement       — same diagnostic entity
//   2. Minor Discrepancy     — differ, but neither changes management
//   3. Major Discrepancy     — clinically significant; sub-classified
//                              false_negative / false_positive /
//                              high_grade_skip
//   4. Adequacy Discrepancy  — a real, separate, parallel metric about
//                              specimen adequacy, not diagnostic
//                              category, tracked independently of 1-3
//
// Real, deliberate simplification: "Minor" vs. "Major" is determined
// by whether the two reviews' own diagnosticRank values
// (ICytologyCategoryService.ts) sit on the same side of the real,
// standard low-grade/benign vs. high-grade/malignant threshold
// (rank ≤2 vs. rank ≥3) — the single axis a two-review comparison
// needs, not a substitute for full ASCCP risk-based management (which
// also weighs patient age and HPV genotype). This mirrors the real
// examples direct guidance itself gave (NILM-with-reactive-changes vs.
// NILM-without; ASC-US vs. LSIL — both same-side, both Minor) without
// hand-coding every real pairwise category comparison.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyCategoryEntry } from './ICytologyCategoryService';

export type CytologyAgreementLevel = 'exact' | 'minor_discrepancy' | 'major_discrepancy';
export type CytologyMajorDiscrepancySubtype = 'false_negative' | 'false_positive' | 'high_grade_skip';

export interface CytologyAgreementResult {
  level: CytologyAgreementLevel;
  /** Present only when level === 'major_discrepancy' — mirrors this
   *  app's own established "detail fields only present when they
   *  apply" convention (QaActivityRecord.severity/delta/rootCause are
   *  the same way). */
  majorSubtype?: CytologyMajorDiscrepancySubtype;
  /** Real, per direct guidance: a genuinely separate, parallel metric
   *  from the diagnostic level above — a case can be an Exact
   *  diagnostic Agreement and STILL carry a real Adequacy Discrepancy,
   *  or vice versa. */
  adequacyDiscrepancy: boolean;
}

/** The real, critical boundary a "High-Grade Skip Discrepancy" crosses
 *  — see this file's own header for the real reasoning. Exported so a
 *  caller (e.g. a real QA dashboard) can reuse the exact same
 *  threshold rather than re-deriving it. */
export const HIGH_GRADE_RANK_THRESHOLD = 3;

// Real, per direct guidance's own NCSR work: exported so the real
// registry-dispatch call site can reuse this exact same real "any
// selected adequacy category is unsatisfactory" check, rather than
// duplicating the same logic a second, potentially-divergent way.
export function isUnsatisfactoryAdequacy(categoryIds: string[] | undefined, categories: CytologyCategoryEntry[]): boolean {
  if (!categoryIds || categoryIds.length === 0) return false;
  // Real, per direct UI-review follow-up: Specimen Adequacy is now a
  // real, multi-select field — ANY selected category flagged
  // isUnsatisfactory (PS-154) is enough, same "any condition true"
  // disjunction this module already uses elsewhere
  // (resolveCytologyHighRiskStatus).
  return categoryIds.some(id => categories.find(c => c.id === id)?.isUnsatisfactory === true);
}

export function classifyCytologyAgreement(
  initial: { primaryInterpretationId: string; adequacyCategoryIds?: string[] },
  followUp: { primaryInterpretationId: string; adequacyCategoryIds?: string[] },
  categories: CytologyCategoryEntry[],
): CytologyAgreementResult {
  const byId = new Map(categories.map(c => [c.id, c]));

  const adequacyDiscrepancy =
    isUnsatisfactoryAdequacy(initial.adequacyCategoryIds, categories) !== isUnsatisfactoryAdequacy(followUp.adequacyCategoryIds, categories);

  if (initial.primaryInterpretationId === followUp.primaryInterpretationId) {
    return { level: 'exact', adequacyDiscrepancy };
  }

  const initialRank = byId.get(initial.primaryInterpretationId)?.diagnosticRank;
  const followUpRank = byId.get(followUp.primaryInterpretationId)?.diagnosticRank;

  // Real, safe default: an unresolvable category (deleted/renamed
  // since the initial review) can't be ranked — never silently
  // treated as Minor. Same "unresolved is never treated as the
  // reassuring answer" posture as resolveCytologyReviewRequirement.
  if (initialRank === undefined || followUpRank === undefined) {
    return { level: 'major_discrepancy', adequacyDiscrepancy };
  }

  const initialHighGrade = initialRank >= HIGH_GRADE_RANK_THRESHOLD;
  const followUpHighGrade = followUpRank >= HIGH_GRADE_RANK_THRESHOLD;

  if (initialHighGrade !== followUpHighGrade) {
    // Real, per direct guidance's own directional sub-labels:
    // - False Negative: initial low-grade, follow-up finds high-grade+
    // - False Positive: initial high-grade+, follow-up finds low-grade
    // Both ARE a "High-Grade Skip" in the general sense direct
    // guidance describes; false_negative/false_positive are the more
    // specific, directional labels real QA dashboards report
    // separately, so this returns the more specific one.
    const majorSubtype: CytologyMajorDiscrepancySubtype =
      followUpRank > initialRank ? 'false_negative' : 'false_positive';
    return { level: 'major_discrepancy', majorSubtype, adequacyDiscrepancy };
  }

  // Same side of the real, critical high-grade threshold — Minor,
  // matching direct guidance's own examples (NILM-with-changes vs.
  // NILM-without; ASC-US vs. LSIL) exactly.
  return { level: 'minor_discrepancy', adequacyDiscrepancy };
}

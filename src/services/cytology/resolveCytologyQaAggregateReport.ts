// src/services/cytology/resolveCytologyQaAggregateReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the aggregate layer this module's own
// README has flagged as a real, deliberate gap since Phase 5 — the
// per-comparison classification logic (classifyCytologyAgreement.ts)
// already existed and was already tested; nothing had ever summarized
// many real comparisons into the two real, standard QA metrics:
//
//   - Overall Agreement %  : the real, strict metric — the proportion
//                            of comparisons reaching the identical
//                            diagnostic conclusion (level === 'exact').
//   - Major Concordance %  : the real, standard, more tolerant metric
//                            — the proportion with NO clinically
//                            significant (major) discrepancy, i.e.
//                            (exact + minor) / total. A case can
//                            differ in wording (Minor) without being
//                            counted against concordance, matching
//                            real, standard cytology QA usage (CAP/
//                            ASC guidance distinguishes "agreement"
//                            from "concordance" on exactly this axis).
//
// Real, honest scope: an empty input (zero real comparisons on file)
// returns 0 for every percent field rather than NaN or a fabricated
// 100% — a real QA dashboard showing "0% agreement, 0 compared" is an
// honest, correct state; "100% agreement, 0 compared" is not.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { CytologyQaComparisonPair } from './resolveCytologyQaComparisonPairs';
import { classifyCytologyAgreement, type CytologyAgreementLevel, type CytologyMajorDiscrepancySubtype } from './classifyCytologyAgreement';

// Real, per direct follow-up: an aggregate-only report told a real
// reviewer "how much" disagreement exists but never "which cases" —
// real QA work requires being able to open the actual comparisons a
// number summarizes, not just trust the number. Real, deliberate
// choice: resolves interpretation labels here (via the same real
// `categories` lookup this module already receives) rather than
// leaving the UI to re-derive them from raw category ids.
export interface CytologyQaComparisonDetail {
  caseId: string;
  specimenId: string;
  initialInterpretationId: string;
  initialInterpretationLabel: string;
  initialReviewerName?: string;
  initialRecordedAt: string;
  followUpInterpretationId: string;
  followUpInterpretationLabel: string;
  followUpReviewerName?: string;
  followUpRecordedAt: string;
  level: CytologyAgreementLevel;
  majorSubtype?: CytologyMajorDiscrepancySubtype;
  adequacyDiscrepancy: boolean;
  /** Real, per direct guidance's own US-QA-01 specification
   *  ("Diagnostic_Downgrade_Count", "Diagnostic_Upgrade_Count") — a
   *  real, general shift direction across every real comparison, not
   *  only major ones (an ASC-US → LSIL shift is a real, genuine
   *  upgrade even though it's only a Minor discrepancy). 'none' when
   *  either interpretation's own diagnosticRank can't be resolved
   *  (e.g. a deleted/renamed category) — never a guessed direction. */
  shiftDirection: 'upgrade' | 'downgrade' | 'none';
}

export interface CytologyQaAggregateReport {
  totalCompared: number;
  exactCount: number;
  minorDiscrepancyCount: number;
  majorDiscrepancyCount: number;
  majorFalseNegativeCount: number;
  majorFalsePositiveCount: number;
  adequacyDiscrepancyCount: number;
  overallAgreementPercent: number;
  majorConcordancePercent: number;
  /** Real, per direct guidance's own CYT-QA-02 specification: "Total
   *  QC False Negatives / Total QC Rescreened Cases" — a real, named
   *  percentage in its own right, not just derivable from the raw
   *  count above. */
  falseNegativeRatePercent: number;
  /** Real, per direct guidance's own US-QA-01 specification. */
  diagnosticUpgradeCount: number;
  diagnosticDowngradeCount: number;
  /** Real, per direct follow-up: the individual comparisons the
   *  counts/percentages above summarize — never trimmed or paginated
   *  here; a real QA dashboard's own job to decide how much of this
   *  to show at once. */
  comparisons: CytologyQaComparisonDetail[];
}

function resolveInterpretationLabel(categoryId: string, categories: CytologyCategoryEntry[]): string {
  return categories.find(c => c.id === categoryId)?.label ?? categoryId;
}

function rankOf(categoryId: string, categories: CytologyCategoryEntry[]): number | undefined {
  return categories.find(c => c.id === categoryId)?.diagnosticRank;
}

export function resolveCytologyQaAggregateReport(
  pairs: CytologyQaComparisonPair[],
  categories: CytologyCategoryEntry[],
): CytologyQaAggregateReport {
  const totalCompared = pairs.length;
  let exactCount = 0;
  let minorDiscrepancyCount = 0;
  let majorDiscrepancyCount = 0;
  let majorFalseNegativeCount = 0;
  let majorFalsePositiveCount = 0;
  let adequacyDiscrepancyCount = 0;
  let diagnosticUpgradeCount = 0;
  let diagnosticDowngradeCount = 0;
  const comparisons: CytologyQaComparisonDetail[] = [];

  for (const pair of pairs) {
    const result = classifyCytologyAgreement(
      { primaryInterpretationId: pair.initial.primaryInterpretationId, adequacyCategoryIds: pair.initial.adequacySelections?.map(s => s.categoryId) },
      { primaryInterpretationId: pair.followUp.primaryInterpretationId, adequacyCategoryIds: pair.followUp.adequacySelections?.map(s => s.categoryId) },
      categories,
    );

    if (result.level === 'exact') exactCount++;
    else if (result.level === 'minor_discrepancy') minorDiscrepancyCount++;
    else {
      majorDiscrepancyCount++;
      if (result.majorSubtype === 'false_negative') majorFalseNegativeCount++;
      else if (result.majorSubtype === 'false_positive') majorFalsePositiveCount++;
    }
    if (result.adequacyDiscrepancy) adequacyDiscrepancyCount++;

    const initialRank = rankOf(pair.initial.primaryInterpretationId, categories);
    const followUpRank = rankOf(pair.followUp.primaryInterpretationId, categories);
    const shiftDirection: 'upgrade' | 'downgrade' | 'none' =
      initialRank === undefined || followUpRank === undefined ? 'none'
      : followUpRank > initialRank ? 'upgrade'
      : followUpRank < initialRank ? 'downgrade'
      : 'none';
    if (shiftDirection === 'upgrade') diagnosticUpgradeCount++;
    else if (shiftDirection === 'downgrade') diagnosticDowngradeCount++;

    comparisons.push({
      caseId: pair.caseId,
      specimenId: pair.specimenId,
      initialInterpretationId: pair.initial.primaryInterpretationId,
      initialInterpretationLabel: resolveInterpretationLabel(pair.initial.primaryInterpretationId, categories),
      initialReviewerName: pair.initial.recordedBy?.userName,
      initialRecordedAt: pair.initial.recordedAt,
      followUpInterpretationId: pair.followUp.primaryInterpretationId,
      followUpInterpretationLabel: resolveInterpretationLabel(pair.followUp.primaryInterpretationId, categories),
      followUpReviewerName: pair.followUp.recordedBy?.userName,
      followUpRecordedAt: pair.followUp.recordedAt,
      level: result.level,
      majorSubtype: result.majorSubtype,
      adequacyDiscrepancy: result.adequacyDiscrepancy,
      shiftDirection,
    });
  }

  return {
    totalCompared,
    exactCount,
    minorDiscrepancyCount,
    majorDiscrepancyCount,
    majorFalseNegativeCount,
    majorFalsePositiveCount,
    adequacyDiscrepancyCount,
    overallAgreementPercent: totalCompared === 0 ? 0 : (exactCount / totalCompared) * 100,
    majorConcordancePercent: totalCompared === 0 ? 0 : ((exactCount + minorDiscrepancyCount) / totalCompared) * 100,
    falseNegativeRatePercent: totalCompared === 0 ? 0 : (majorFalseNegativeCount / totalCompared) * 100,
    diagnosticUpgradeCount,
    diagnosticDowngradeCount,
    comparisons,
  };
}

// src/services/cytology/resolveCytologyCtStatisticalComparisonReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied CYT-QA-01 specification
// ("Statistical Comparison of Individual Cytotechnologist to
// Laboratory Totals" — real regulatory drivers: US CLIA '88 §493.1274,
// CAP CYP.28500, Australia NPAAC, UK NHSCSP).
//
// Real, deliberate design: buckets every real primary_screen review by
// its own real diagnosticRank (0-5, this module's own established,
// nomenclature-agnostic severity axis from Phase 6) rather than by raw
// category id — the same real reason diagnosticRank was built in the
// first place: a CT's real rate stats need to be comparable across
// Bethesda, BSCC, München III, and CISOE-A alike, not siloed per
// dictionary. Real, honest simplification, same as Phase 6's own:
// rank 3 (ASC-H/AGC-NOS combined) is shown as "ASC-H" per the given
// spec's own column name; rank 4-5 combine into "HSIL+" per the given
// spec's own "(HSIL+ / Total Screened)" formula.
//
// Real, standard statistical method for Variance_Flag ("> ±2 Standard
// Deviations from peer mean"): population standard deviation across
// every real CT's own ASCUS/LSIL ratio, excluding any CT with zero
// real LSIL cases from the SD calculation itself (an undefined ratio
// cannot meaningfully contribute to "how much do ratios vary") — such
// a CT's own ratio is reported as null, never a fabricated number,
// and never flagged (there is nothing real to compare against).
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import { isUnsatisfactoryAdequacy } from './classifyCytologyAgreement';

export interface CytologyCtStatisticalComparisonRow {
  ctUserId: string;
  ctUserName?: string;
  totalScreened: number;
  unsatRatePercent: number;
  nilmRatePercent: number;
  ascusRatePercent: number;
  aschRatePercent: number;
  lsilRatePercent: number;
  hsilPlusRatePercent: number;
  /** Real, honest null when this CT has zero real LSIL cases — an
   *  undefined ratio, never a fabricated number. */
  ascusLsilRatio: number | null;
  /** Real, whole-laboratory ratio across every real CT — the same
   *  real value repeated on every row, per the given spec's own
   *  "Baseline comparison against overall laboratory average." */
  labAvgAscusLsilRatio: number | null;
  varianceFlag: boolean;
}

function rankOf(interpretationId: string, categories: CytologyCategoryEntry[]): number | undefined {
  return categories.find(c => c.id === interpretationId)?.diagnosticRank;
}

export function resolveCytologyCtStatisticalComparisonReport(
  primaryScreenReviews: CytologyReviewRecord[],
  categories: CytologyCategoryEntry[],
): CytologyCtStatisticalComparisonRow[] {
  const byCt = new Map<string, CytologyReviewRecord[]>();
  for (const r of primaryScreenReviews) {
    const list = byCt.get(r.recordedBy.userId) ?? [];
    list.push(r);
    byCt.set(r.recordedBy.userId, list);
  }

  let labAscusTotal = 0;
  let labLsilTotal = 0;

  const partial = Array.from(byCt.entries()).map(([ctUserId, reviews]) => {
    const total = reviews.length;
    let unsatCount = 0, nilmCount = 0, ascusCount = 0, aschCount = 0, lsilCount = 0, hsilPlusCount = 0;

    for (const r of reviews) {
      if (isUnsatisfactoryAdequacy(r.adequacySelections?.map(s => s.categoryId), categories)) unsatCount++;
      const rank = rankOf(r.primaryInterpretationId, categories);
      if (rank === 0) nilmCount++;
      else if (rank === 1) ascusCount++;
      else if (rank === 2) lsilCount++;
      else if (rank === 3) aschCount++;
      else if (rank !== undefined && rank >= 4) hsilPlusCount++;
    }

    labAscusTotal += ascusCount;
    labLsilTotal += lsilCount;

    return {
      ctUserId,
      ctUserName: reviews[0]?.recordedBy.userName,
      totalScreened: total,
      unsatRatePercent: total === 0 ? 0 : (unsatCount / total) * 100,
      nilmRatePercent: total === 0 ? 0 : (nilmCount / total) * 100,
      ascusRatePercent: total === 0 ? 0 : (ascusCount / total) * 100,
      aschRatePercent: total === 0 ? 0 : (aschCount / total) * 100,
      lsilRatePercent: total === 0 ? 0 : (lsilCount / total) * 100,
      hsilPlusRatePercent: total === 0 ? 0 : (hsilPlusCount / total) * 100,
      ascusLsilRatio: lsilCount === 0 ? null : ascusCount / lsilCount,
    };
  });

  const labAvgAscusLsilRatio = labLsilTotal === 0 ? null : labAscusTotal / labLsilTotal;

  const realRatios = partial.map(p => p.ascusLsilRatio).filter((r): r is number => r !== null);
  const mean = realRatios.length === 0 ? 0 : realRatios.reduce((a, b) => a + b, 0) / realRatios.length;
  const variance = realRatios.length === 0 ? 0 : realRatios.reduce((a, b) => a + (b - mean) ** 2, 0) / realRatios.length;
  const stdDev = Math.sqrt(variance);

  return partial.map(p => ({
    ...p,
    labAvgAscusLsilRatio,
    varianceFlag: p.ascusLsilRatio !== null && stdDev > 0 && Math.abs(p.ascusLsilRatio - mean) > 2 * stdDev,
  }));
}

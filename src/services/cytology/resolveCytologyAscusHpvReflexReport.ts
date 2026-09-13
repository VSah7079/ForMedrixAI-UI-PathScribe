// src/services/cytology/resolveCytologyAscusHpvReflexReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied MOL-QA-03 specification
// ("ASC-US Cytology / HPV Triage Reflex Rate & Concordance Report" —
// real regulatory drivers: CAP CYP.28500, ASCCP Guidelines, European
// Guidelines for QA in Cervical Cancer Screening).
//
// Real, buildable directly from data this app already captures: a
// real ASC-US call is any real primary_screen review whose own
// diagnosticRank resolves to 1 (this module's own established,
// nomenclature-agnostic severity axis) — the same real approach
// resolveCytologyCtStatisticalComparisonReport.ts already uses.
// hpvOrderReason/hpvResult already live on Specimen.cytologyScreening
// (PS-164) — passed in here keyed by specimenId, since a review record
// itself carries no HPV data of its own.
//
// Real, standard outlier bands per the given spec's own stated
// benchmark: 30%-60% HPV positivity among reflexed ASC-US calls is
// Normal; below 30% is Under-calling (implying over-diagnosis of
// benign findings as ASC-US); above 60% is Over-calling (implying
// under-calling of genuine LSIL as ASC-US). Real, honest scope: a CT
// with zero real reflexed cases gets 'insufficient_data', never a
// fabricated "Normal" label with nothing behind it.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

const ASCUS_RANK = 1;

export interface CytologySpecimenHpvContext {
  hpvOrderReason?: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance';
  hpvResult?: 'Positive' | 'Negative' | 'Pending' | 'Not Performed';
}

export type CytologyAscusHpvOutlierStatus = 'normal' | 'under_calling' | 'over_calling' | 'insufficient_data';

export interface CytologyAscusHpvReflexRow {
  ctUserId: string;
  ctUserName?: string;
  totalAscusCases: number;
  reflexHpvOrdered: number;
  reflexOrderRatePercent: number;
  hpvPositiveCount: number;
  ascusHpvPosPercent: number;
  outlierStatus: CytologyAscusHpvOutlierStatus;
}

export function resolveCytologyAscusHpvReflexReport(
  primaryScreenReviews: CytologyReviewRecord[],
  categories: CytologyCategoryEntry[],
  specimenHpvBySpecimenId: Record<string, CytologySpecimenHpvContext>,
): CytologyAscusHpvReflexRow[] {
  const ascusReviews = primaryScreenReviews.filter(
    r => categories.find(c => c.id === r.primaryInterpretationId)?.diagnosticRank === ASCUS_RANK,
  );

  const byCt = new Map<string, CytologyReviewRecord[]>();
  for (const r of ascusReviews) {
    const list = byCt.get(r.recordedBy.userId) ?? [];
    list.push(r);
    byCt.set(r.recordedBy.userId, list);
  }

  return Array.from(byCt.entries()).map(([ctUserId, reviews]) => {
    const totalAscusCases = reviews.length;
    const reflexed = reviews.filter(r => specimenHpvBySpecimenId[r.specimenId]?.hpvOrderReason === 'ascus_reflex');
    const reflexHpvOrdered = reflexed.length;
    const hpvPositiveCount = reflexed.filter(r => specimenHpvBySpecimenId[r.specimenId]?.hpvResult === 'Positive').length;
    const ascusHpvPosPercent = reflexHpvOrdered === 0 ? 0 : (hpvPositiveCount / reflexHpvOrdered) * 100;

    const outlierStatus: CytologyAscusHpvOutlierStatus =
      reflexHpvOrdered === 0 ? 'insufficient_data'
      : ascusHpvPosPercent < 30 ? 'under_calling'
      : ascusHpvPosPercent > 60 ? 'over_calling'
      : 'normal';

    return {
      ctUserId,
      ctUserName: reviews[0]?.recordedBy.userName,
      totalAscusCases,
      reflexHpvOrdered,
      reflexOrderRatePercent: totalAscusCases === 0 ? 0 : (reflexHpvOrdered / totalAscusCases) * 100,
      hpvPositiveCount,
      ascusHpvPosPercent,
      outlierStatus,
    };
  });
}

// src/services/cytology/resolveCytologyQaComparisonPairs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the pairing layer classifyCytologyAgreement.ts
// itself deliberately doesn't do — that module classifies one real,
// already-paired comparison; this module finds the real pairs.
//
// Real, per direct guidance's own confirmed role taxonomy
// (CytologyReviewRecord.ts): 'primary_screen' (Cytotechnologist) is the
// real initial review every one of the three standard QA report types
// compares against:
//   - 10% Random Rescreening    : primary_screen  vs qc_random_selection
//   - Directed/High-Risk Rescreening: primary_screen vs qc_targeted_high_risk
//   - CT vs. Pathologist Correlation: primary_screen vs pathologist_review
//
// Real, deliberate scope: this module pairs by role only, on the same
// real specimenId — it does not decide which reports exist or how
// their results aggregate (resolveCytologyQaAggregateReport.ts's own
// job). A specimen with no review of the requested follow-up role
// contributes no real pair; never a fabricated one.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord, CytologyReviewRole } from '@/types/cytology/CytologyReviewRecord';

export interface CytologyQaComparisonPair {
  specimenId: string;
  caseId: string;
  initial: CytologyReviewRecord;
  followUp: CytologyReviewRecord;
}

/** Real, safe tie-break for the rare real case of more than one review
 *  on file with the same role for the same specimen (e.g. a corrected
 *  re-entry) — the most recently recorded one wins, matching this
 *  module's own established "most recent" convention elsewhere
 *  (resolveOwnCytologyReview.ts). */
function mostRecent(reviews: CytologyReviewRecord[]): CytologyReviewRecord {
  return reviews.reduce((latest, r) => (r.recordedAt > latest.recordedAt ? r : latest));
}

export function resolveCytologyQaComparisonPairs(
  reviews: CytologyReviewRecord[],
  initialRole: CytologyReviewRole,
  followUpRole: CytologyReviewRole,
): CytologyQaComparisonPair[] {
  const bySpecimen = new Map<string, CytologyReviewRecord[]>();
  for (const r of reviews) {
    const list = bySpecimen.get(r.specimenId) ?? [];
    list.push(r);
    bySpecimen.set(r.specimenId, list);
  }

  const pairs: CytologyQaComparisonPair[] = [];
  for (const [specimenId, specimenReviews] of bySpecimen) {
    const initialReviews = specimenReviews.filter(r => r.role === initialRole);
    const followUpReviews = specimenReviews.filter(r => r.role === followUpRole);
    if (initialReviews.length === 0 || followUpReviews.length === 0) continue;

    const initial = mostRecent(initialReviews);
    const followUp = mostRecent(followUpReviews);
    pairs.push({ specimenId, caseId: initial.caseId, initial, followUp });
  }
  return pairs;
}

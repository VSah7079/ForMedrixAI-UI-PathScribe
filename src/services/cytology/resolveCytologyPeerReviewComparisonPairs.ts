// src/services/cytology/resolveCytologyPeerReviewComparisonPairs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Continue to the comparison displays"):
// the pairing layer for post-sign-out peer review correlation —
// genuinely different from resolveCytologyQaComparisonPairs.ts's own
// fixed-role pairing (primary_screen vs. a specific, named follow-up
// role), because the "original" side of a peer-review comparison is
// whichever real review a human actually selected as Final Diagnosis
// at sign-out — CytologyFinalDiagnosisSnapshot.reviewRecordId, per
// resolveCytologyFinalDiagnosisSnapshot.ts — which could genuinely be
// ANY real role (a Cytotechnologist's own primary_screen, a QC
// reviewer's rescreen, or a Pathologist's own pathologist_review),
// never one fixed role the way the other three real reports compare.
//
// Real, deliberate reuse: the same real CytologyQaComparisonPair shape
// resolveCytologyQaComparisonPairs.ts already exports, so
// resolveCytologyQaAggregateReport.ts needs zero changes to consume
// either kind of pair.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyQaComparisonPair } from './resolveCytologyQaComparisonPairs';

export interface CytologySpecimenFinalDiagnosisRef {
  specimenId: string;
  caseId: string;
  finalDiagnosisReviewRecordId: string;
}

/** Real, safe tie-break for more than one real peer-review review on
 *  file for the same specimen — same "most recent wins" convention
 *  resolveCytologyQaComparisonPairs.ts's own private helper already
 *  uses. */
function mostRecent(reviews: CytologyReviewRecord[]): CytologyReviewRecord {
  return reviews.reduce((latest, r) => (r.recordedAt > latest.recordedAt ? r : latest));
}

export function resolveCytologyPeerReviewComparisonPairs(
  reviews: CytologyReviewRecord[],
  specimenFinalDiagnoses: CytologySpecimenFinalDiagnosisRef[],
): CytologyQaComparisonPair[] {
  const reviewById = new Map(reviews.map(r => [r.id, r]));
  const bySpecimen = new Map<string, CytologyReviewRecord[]>();
  for (const r of reviews) {
    const list = bySpecimen.get(r.specimenId) ?? [];
    list.push(r);
    bySpecimen.set(r.specimenId, list);
  }

  const pairs: CytologyQaComparisonPair[] = [];
  for (const spec of specimenFinalDiagnoses) {
    const finalReview = reviewById.get(spec.finalDiagnosisReviewRecordId);
    if (!finalReview) continue; // real, honest skip — no fabricated pair for a dangling/missing reference

    const specimenReviews = bySpecimen.get(spec.specimenId) ?? [];
    const peerReviews = specimenReviews.filter(
      r => r.role === 'post_signout_peer_review_random' || r.role === 'post_signout_peer_review_targeted',
    );
    if (peerReviews.length === 0) continue;

    pairs.push({ specimenId: spec.specimenId, caseId: spec.caseId, initial: finalReview, followUp: mostRecent(peerReviews) });
  }
  return pairs;
}

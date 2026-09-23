// src/services/quality/resolveSurgicalBiopsyToResectionCorrelationPoolMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. Real, direct analog of Cytology's own
// resolveCytologyHistologyCorrelationPoolMembership.ts, typed against
// SurgicalPeerReviewRecord.biopsyToResectionCandidates instead of
// CytologyScreeningRecord.histologyCorrelationCandidates — same exact
// real logic: a specimen still belongs in the worklist when at least
// one candidate has neither been recorded nor dismissed.
// ─────────────────────────────────────────────────────────────────────────────

import type { SurgicalPeerReviewRecord } from '@/types/case/Specimen';

export function resolveSurgicalBiopsyToResectionCorrelationPoolMembership(
  candidates: SurgicalPeerReviewRecord['biopsyToResectionCandidates'],
): boolean {
  if (!candidates || candidates.length === 0) return false;
  return candidates.some(c => c.recordedActivityRecordId === undefined && !c.dismissedAsNotRelevant);
}

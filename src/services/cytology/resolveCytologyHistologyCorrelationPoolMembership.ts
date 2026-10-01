// src/services/cytology/resolveCytologyHistologyCorrelationPoolMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (CYT-QA-04): whether a specimen still
// belongs in the real Histology Correlation worklist tile — true when
// at least one real candidate (resolveCytologyHistologyCorrelationCandidates.ts)
// has neither had its actual correlation recorded
// (recordedActivityRecordId still undefined) nor been dismissed as not
// actually relevant (dismissedAsNotRelevant) — both are real, distinct
// ways a candidate can be genuinely resolved. Matches this module's
// own established pool-membership pattern
// (resolveCytologyQcPoolMembership.ts, resolveCytologyRetrospectiveReviewPoolMembership.ts)
// exactly.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyScreeningRecord } from '@/types/case/Specimen';

export function resolveCytologyHistologyCorrelationPoolMembership(
  candidates: CytologyScreeningRecord['histologyCorrelationCandidates'],
): boolean {
  if (!candidates || candidates.length === 0) return false;
  return candidates.some(c => c.recordedActivityRecordId === undefined && !c.dismissedAsNotRelevant);
}

// src/services/quality/resolveSurgicalPeerReviewPoolMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. Real, direct analog of Cytology's own
// resolveCytologyPostSignOutPeerReviewPoolMembership.ts — genuinely
// simpler here because SurgicalPeerReviewRecord tracks a single, real
// FK (peerReviewRecordedActivityRecordId) rather than needing to match
// against a role-tagged review list: a flag is cleared the moment a
// real QaActivityRecord for this review has actually been created,
// full stop, regardless of whether it was the random or targeted
// reason that raised it.
// ─────────────────────────────────────────────────────────────────────────────

import type { SurgicalPeerReviewRecord } from '@/types/case/Specimen';

export function resolveSurgicalPeerReviewPoolMembership(
  surgicalPeerReview: SurgicalPeerReviewRecord | undefined,
): boolean {
  if (!surgicalPeerReview?.postSignOutPeerReviewFlag) return false;
  return surgicalPeerReview.peerReviewRecordedActivityRecordId === undefined;
}

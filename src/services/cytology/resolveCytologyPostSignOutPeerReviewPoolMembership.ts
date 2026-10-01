// src/services/cytology/resolveCytologyPostSignOutPeerReviewPoolMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own explicit instruction: "reusing your
// existing qc_random_selection and qc_targeted_high_risk logic keeps
// the system architecture consistent across both pre- and post-sign-
// out queues." This mirrors resolveCytologyQcPoolMembership.ts's own
// exact clearing logic — a random-selection flag is cleared only by a
// matching real `post_signout_peer_review_random` review; a
// targeted-high-risk flag only by a matching real
// `post_signout_peer_review_targeted` one — never cross-cleared,
// since they remain genuinely different real QA obligations even
// though both use the same real flag shape.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyScreeningRecord } from '@/types/case/Specimen';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

export function resolveCytologyPostSignOutPeerReviewPoolMembership(
  postSignOutPeerReviewFlag: CytologyScreeningRecord['postSignOutPeerReviewFlag'],
  existingReviews: Pick<CytologyReviewRecord, 'role'>[],
): boolean {
  if (!postSignOutPeerReviewFlag) return false;
  const clearingRole = postSignOutPeerReviewFlag.reason === 'random_selection'
    ? 'post_signout_peer_review_random'
    : 'post_signout_peer_review_targeted';
  const cleared = existingReviews.some(r => r.role === clearingRole);
  return !cleared;
}

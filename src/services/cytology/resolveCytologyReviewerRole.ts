// src/services/cytology/resolveCytologyReviewerRole.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct UI-review follow-up: "The system should default the
// role, if there are no reviews on record, they are the Primary
// Screener. If there is a Review associated to the case and you're not
// a Pathologist, then you are a Secondary Reviewer. If your the
// Pathologist, you are the Pathologist Review." Replaces this module's
// earlier design — a manual role dropdown pre-selected with a default
// — with a real, fully automatic, deterministic result. There is no
// longer a role picker in the real capture UI at all.
//
// Real, deliberate ordering: a Pathologist's own role never depends on
// how many reviews already exist — reviewing first or fifth, they are
// always doing a Pathologist Review, never a "Primary Screener," which
// is specifically a Cytotechnologist's own real screening role. Real,
// per direct guidance's own stated outcomes, this still covers all
// three: no prior reviews + not a Pathologist → Primary Screener;
// prior reviews exist + not a Pathologist → Secondary Reviewer;
// Pathologist, either way → Pathologist Review.
//
// Real, additional reconciliation with this module's own existing QC
// mechanism (resolveCytologyQcPoolMembership, PS-165): a Cytotech
// doing a follow-up review on a case still genuinely pending mandatory
// QC defaults to the real, specific QC role that would actually clear
// it (qc_random_selection / qc_targeted_high_risk), not a plain
// Secondary Reviewer that would leave the flag stuck open — direct
// guidance's own three-outcome rule didn't name this case, but leaving
// it as plain Secondary Reviewer would silently defeat PS-165's own
// QC-clearing logic.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRole, CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyScreeningRecord } from '@/types/case/Specimen';
import { resolveCytologyQcPoolMembership } from './resolveCytologyQcPoolMembership';
import { resolveCytologyPostSignOutPeerReviewPoolMembership } from './resolveCytologyPostSignOutPeerReviewPoolMembership';

export function resolveCytologyReviewerRole(
  existingReviews: Pick<CytologyReviewRecord, 'role'>[],
  isPathologist: boolean,
  qcFlag?: CytologyScreeningRecord['qcFlag'],
  // Real, per direct follow-up closing PS-214's own remaining gap: a
  // real, previously-missing check — peer review specifically
  // requires a genuinely DIFFERENT pathologist from whoever signed
  // the original report out. Without originalSignerId/currentUserId,
  // the same pathologist could otherwise "peer review" their own
  // work, defeating the entire real purpose of the mechanism.
  // Deliberately grouped as one object rather than three more bare
  // parameters, since all three only ever matter together.
  postSignOutPeerReview?: {
    flag: CytologyScreeningRecord['postSignOutPeerReviewFlag'];
    originalSignerId: string | undefined;
    currentUserId: string;
  },
): CytologyReviewRole {
  if (isPathologist) {
    if (
      postSignOutPeerReview?.flag &&
      postSignOutPeerReview.originalSignerId !== postSignOutPeerReview.currentUserId &&
      resolveCytologyPostSignOutPeerReviewPoolMembership(postSignOutPeerReview.flag, existingReviews)
    ) {
      return postSignOutPeerReview.flag.reason === 'random_selection' ? 'post_signout_peer_review_random' : 'post_signout_peer_review_targeted';
    }
    return 'pathologist_review';
  }

  if (qcFlag && resolveCytologyQcPoolMembership(qcFlag, existingReviews)) {
    return qcFlag.reason === 'random_selection' ? 'qc_random_selection' : 'qc_targeted_high_risk';
  }

  return existingReviews.length === 0 ? 'primary_screen' : 'secondary_reviewer';
}

// src/types/reports/InformalReviewRequest.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "I want informal reviews to be
// handled differently than delegations types, so remove the informal
// action from that workflow. I want to queue these informal requests
// on the worklist with a Tile and when those cases are selected it
// opens to that intermediate page where they can publish their
// review."
//
// A real, dedicated model — deliberately NOT a DelegationRecord, per
// direct correction: "delegation seems to imply a change in case
// ownership, rather than an informal review." This never transfers
// ownership; it's a lightweight ask-a-colleague workflow with its own,
// real lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * pending   — request sent, reviewer hasn't published their review yet.
 *             Surfaces on the reviewer's Worklist "Informal Review" tile.
 * published — reviewer added their review (a real InternalNote, type
 *             'informal_review'). Leaves the reviewer's tile. The
 *             original requester hasn't necessarily seen it yet — see
 *             seenByRequesterAt below, which drives the real "effect"
 *             on SynopticReportPage's Internal Notes button.
 * closed    — the original requester has opened/seen the published
 *             review. Terminal state.
 */
export type InformalReviewRequestStatus = 'pending' | 'published' | 'closed';

export interface InformalReviewRequest {
  id: string;
  /** Real Case.id — the same identifier used throughout the rest of
   *  the app (Worklist, caseRouter, FullReportPage's own route param). */
  caseId: string;
  caseLabel?: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  /** The initial ask/context, e.g. "Curious if you agree on the margin
   *  call here." Optional — a colleague can ask with no extra note. */
  note?: string;
  status: InformalReviewRequestStatus;
  requestedAt: string;
  /** Set when the reviewer publishes their review — see
   *  publishedNoteId, which links back to the real InternalNote this
   *  produced. */
  publishedAt?: string;
  publishedNoteId?: string;
  /** Set when the original requester has actually opened/seen the
   *  published review — clears the Internal Notes button effect. */
  seenByRequesterAt?: string;
}

export type NewInformalReviewRequest = Pick<
  InformalReviewRequest,
  'caseId' | 'caseLabel' | 'fromUserId' | 'fromUserName' | 'toUserId' | 'toUserName' | 'note'
>;

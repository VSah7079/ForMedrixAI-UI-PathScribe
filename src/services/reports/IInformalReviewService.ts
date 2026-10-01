// src/services/reports/IInformalReviewService.ts
import { ServiceResult, ID } from '../types';
import type { InformalReviewRequest, NewInformalReviewRequest } from '@/types/reports/InformalReviewRequest';

export interface IInformalReviewService {
  /** Every real, pending request assigned to this reviewer — powers
   *  the Worklist's "Informal Review" tile. */
  getPendingForReviewer(userId: ID): Promise<ServiceResult<InformalReviewRequest[]>>;

  /** Every real request this user originally sent, regardless of
   *  status — used to find published-but-unseen reviews for the
   *  Internal Notes button effect on SynopticReportPage. */
  getSentByRequester(userId: ID): Promise<ServiceResult<InformalReviewRequest[]>>;

  /** Real, pending or published requests for one specific case,
   *  regardless of who's asking — used to check "is this a genuine
   *  response to a real pending request" when a reviewer adds an
   *  Informal Review note. */
  getForCase(caseId: string): Promise<ServiceResult<InformalReviewRequest[]>>;

  /** Every real request where this user is either the requester or
   *  the reviewer, any status — used for reporting/analytics (the
   *  "My Contribution" dashboard's CONSULTATION_RESPONSE/
   *  CONSULTATION_AWAITING metrics), not just the live Worklist tile. */
  getAllForUser(userId: ID): Promise<ServiceResult<InformalReviewRequest[]>>;

  /** Creates a new, pending request. */
  create(request: NewInformalReviewRequest): Promise<ServiceResult<InformalReviewRequest>>;

  /** Moves a request from pending -> published, linking the real
   *  InternalNote the reviewer just created. */
  publish(id: ID, noteId: string): Promise<ServiceResult<InformalReviewRequest>>;

  /** Moves a request from published -> closed — the original
   *  requester has now seen it. */
  markSeenByRequester(id: ID): Promise<ServiceResult<InformalReviewRequest>>;
}

// src/services/cytologyQc/ICytologyQcCaseAssignmentService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §3's own workflow state machine. Every transition
// method here enforces its own real, required starting state — never
// silently allows e.g. recording a discrepancy on a case that was
// never actually put "in review."
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { CytologyQcCaseAssignment } from '@/types/cytologyQc/CytologyQcRule';

export type NewCytologyQcCaseAssignment = Omit<CytologyQcCaseAssignment, 'id'>;

export interface ICytologyQcCaseAssignmentService {
  getAll(): Promise<ServiceResult<CytologyQcCaseAssignment[]>>;
  getById(id: ID): Promise<ServiceResult<CytologyQcCaseAssignment>>;
  getByCaseId(caseId: string): Promise<ServiceResult<CytologyQcCaseAssignment[]>>;
  /** Real, per direct resolution — the one, real unified Peer Review
   *  Queue: every assignment still in QC_PENDING or QC_IN_REVIEW,
   *  real-sorted by the urgency matrix (sortQcQueueByPriority.ts).
   *  Never filtered by triggerSource here — that's the real, separate
   *  job of the badge/tab UI layer, not this data source. */
  getUnifiedQueue(): Promise<ServiceResult<CytologyQcCaseAssignment[]>>;
  create(assignment: NewCytologyQcCaseAssignment): Promise<ServiceResult<CytologyQcCaseAssignment>>;
  /** Real, per spec §2.2's own Self-Review Prevention — rejects
   *  honestly (never silently reassigns to someone else) if
   *  `reviewerId` is the case's own real primary sign-out provider.
   *  Requires the assignment to genuinely be QC_PENDING; transitions
   *  it to QC_IN_REVIEW. */
  assignReviewer(id: ID, reviewerId: string): Promise<ServiceResult<CytologyQcCaseAssignment>>;
  /** Real, per spec §3's own QC_RESOLVED (concurrence) ->
   *  FINAL_APPROVED transition. Requires the assignment to genuinely
   *  be QC_IN_REVIEW. */
  recordConcurrence(id: ID, reviewerCommentary?: string): Promise<ServiceResult<CytologyQcCaseAssignment>>;
  /** Real, per spec §3's own QC_RESOLVED (discrepancy) ->
   *  QC_DISCREPANCY_REVISE transition, and §4's own discrepancy
   *  logging (primary/secondary codes, severity). Requires the
   *  assignment to genuinely be QC_IN_REVIEW. */
  recordDiscrepancy(
    id: ID,
    discrepancy: { primaryDiagnosticCode: string; secondaryDiagnosticCode: string; severity: 'major' | 'minor'; reviewerCommentary?: string },
  ): Promise<ServiceResult<CytologyQcCaseAssignment>>;
  /** Real, per spec §2.3's own "reassign the case to an available
   *  reviewer" — see resolveNewQcCaseAssignment.ts's own header for
   *  the real, honest scope this reflects (no real "available
   *  reviewer" tracking exists to reassign to directly). Requires the
   *  assignment to genuinely be QC_IN_REVIEW (a case that never had a
   *  reviewer assigned has nothing to escalate away from — its own
   *  QC_PENDING SLA breach is a real, separate staffing/triage
   *  concern, not this method's job). Real, honest refusal if the
   *  case is not genuinely SLA-breached at the real, current moment
   *  — never lets this be used to arbitrarily bump a case off a
   *  reviewer's plate. */
  escalateForSlaBreach(id: ID, now: string, reason: string): Promise<ServiceResult<CytologyQcCaseAssignment>>;
  /** Real, per spec §2.3's own "authorized supervisor bypass to
   *  prevent clinical delays." Forces the case directly to
   *  FINAL_APPROVED regardless of its current real state (except an
   *  already-terminal one) — real, always logged, never silent. */
  supervisorBypass(id: ID, supervisorId: string, justification: string): Promise<ServiceResult<CytologyQcCaseAssignment>>;
}

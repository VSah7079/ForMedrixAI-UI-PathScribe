// src/services/quality/IQaSupervisionAssignmentService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-114. Mirrors IFppeAssignmentService's own real, 5-method shape
// exactly - this archetype needs real, in-place mutations
// (recordCaseReviewed/graduate), not the simple append-only
// getAll/create shape PS-113's review-with-outcome archetype uses.
//
// Real, deliberate design decision: getActiveAssignmentForUser takes
// activityTypeId as a required, explicit parameter - the old,
// FPPE-only service never needed this (FPPE was the only real
// supervision-style activity that existed), but the new, generic
// service could in principle serve more than one. Making the caller
// state which activity type it means avoids real ambiguity if a user
// is ever under more than one active supervision-style assignment at
// once.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult } from '../types';
import type { QaSupervisionAssignment } from '@/types/quality/QaSupervisionAssignment';
import type { QaSupervisionEndCondition } from '@/types/quality/QaSupervisionAssignmentType';

export interface IQaSupervisionAssignmentService {
  getAll(): Promise<ServiceResult<QaSupervisionAssignment[]>>;
  /** The real check a sign-out gate needs — is this user currently
   *  under an active assignment of this specific activity type
   *  (optionally scoped to a subspecialty)? Returns null if not,
   *  rather than an error — "not under supervision" is the common,
   *  expected case for most users. */
  getActiveAssignmentForUser(activityTypeId: string, userId: string, subspecialtyId?: string): Promise<ServiceResult<QaSupervisionAssignment | null>>;
  create(input: {
    /** Real, optional explicit id — used only by the real shadow-write
     *  from FppeAssignmentsSection.tsx (PS-114, Stage 3), so the same
     *  logical assignment shares one real id across both systems
     *  during the real transition period. Omitted for a genuinely new
     *  create through this service directly, which still auto-
     *  generates its own fresh id as normal. */
    id?: string;
    activityTypeId: string;
    superviseeUserId: string;
    superviseeUserName: string;
    supervisorUserId: string;
    supervisorUserName: string;
    subspecialtyId?: string;
    facilityId?: string;
    endCondition: QaSupervisionEndCondition;
  }): Promise<ServiceResult<QaSupervisionAssignment>>;
  /** Called when a real case review completes for someone under an
   *  active assignment — increments the count and auto-completes the
   *  assignment if the end condition is now met. */
  recordCaseReviewed(assignmentId: string): Promise<ServiceResult<QaSupervisionAssignment>>;
  /** Manual early completion — a supervisor or admin can graduate
   *  someone before the formal threshold if satisfied earlier than
   *  planned. */
  graduate(assignmentId: string): Promise<ServiceResult<QaSupervisionAssignment>>;
}

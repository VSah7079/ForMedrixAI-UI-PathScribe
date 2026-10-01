// src/services/cases/IFppeAssignmentService.ts
import { ServiceResult } from '../types';
import type { FppeAssignment, FppeEndCondition } from '@/types/case/FppeAssignment';

export interface IFppeAssignmentService {
  getAll(): Promise<ServiceResult<FppeAssignment[]>>;
  /** The real check the sign-out gate needs — is this user currently
   *  under an active FPPE assignment (optionally scoped to a
   *  subspecialty)? Returns null if not, rather than an error — "not
   *  under FPPE" is the common, expected case for most users. */
  getActiveAssignmentForUser(userId: string, subspecialtyId?: string): Promise<ServiceResult<FppeAssignment | null>>;
  create(input: {
    provisionalUserId: string;
    provisionalUserName: string;
    proctorUserId: string;
    proctorUserName: string;
    facilityId: string;
    subspecialtyId?: string;
    endCondition: FppeEndCondition;
  }): Promise<ServiceResult<FppeAssignment>>;
  /** Called when a countersign completes for someone under an active
   *  FPPE assignment — increments the count and auto-completes the
   *  assignment if the end condition is now met. */
  recordCaseReviewed(assignmentId: string): Promise<ServiceResult<FppeAssignment>>;
  /** Manual early completion — a proctor or admin can graduate someone
   *  before the formal threshold if satisfied earlier than planned. */
  graduate(assignmentId: string): Promise<ServiceResult<FppeAssignment>>;
}

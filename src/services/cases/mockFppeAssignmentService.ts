// src/services/cases/mockFppeAssignmentService.ts
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { FppeAssignment } from '@/types/case/FppeAssignment';
import type { IFppeAssignmentService } from './IFppeAssignmentService';
import { computeFppeProgress } from './fppeEndCondition';

const STORAGE_KEY = 'fppe_assignments';
const load    = (): FppeAssignment[] => storageGet<FppeAssignment[]>(STORAGE_KEY, []);
const persist = (data: FppeAssignment[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err = <T>(message: string): ServiceResult<T> => ({ ok: false, error: message });

/** Real end-condition check — 'either' means whichever threshold is hit
 *  first, matching the most common real FPPE policy shape. Delegates to
 *  fppeEndCondition.ts's shared computeFppeProgress() — the one real
 *  source of truth also used by the admin/tracking-tab progress
 *  displays, so they can never silently disagree with this real
 *  enforcement check. */
function endConditionMet(a: FppeAssignment): boolean {
  return computeFppeProgress(a).met;
}
function completionReason(a: FppeAssignment): 'case_count_met' | 'duration_met' {
  if (a.endCondition.type === 'case_count') return 'case_count_met';
  if (a.endCondition.type === 'duration_days') return 'duration_met';
  // 'either' — whichever actually triggered. Only called after
  // endConditionMet() already confirmed true, so if the case-count
  // threshold wasn't the trigger, the duration one must have been.
  const { byCasesFraction } = computeFppeProgress(a);
  return (byCasesFraction ?? 0) >= 1 ? 'case_count_met' : 'duration_met';
}

export const mockFppeAssignmentService: IFppeAssignmentService = {
  async getAll() {
    return ok([...load()]);
  },

  async getActiveAssignmentForUser(userId, subspecialtyId) {
    const assignment = load().find(a =>
      a.provisionalUserId === userId && a.status === 'active'
      && (a.subspecialtyId === undefined || a.subspecialtyId === subspecialtyId)
    );
    return ok(assignment ?? null);
  },

  async create(input) {
    const newAssignment: FppeAssignment = {
      id: `fppe-${Date.now().toString(36)}`,
      provisionalUserId: input.provisionalUserId,
      provisionalUserName: input.provisionalUserName,
      proctorUserId: input.proctorUserId,
      proctorUserName: input.proctorUserName,
      facilityId: input.facilityId,
      subspecialtyId: input.subspecialtyId,
      startedAt: new Date().toISOString(),
      endCondition: input.endCondition,
      casesReviewedCount: 0,
      status: 'active',
    };
    persist([newAssignment, ...load()]);
    return ok(newAssignment);
  },

  async recordCaseReviewed(assignmentId) {
    const assignments = load();
    const idx = assignments.findIndex(a => a.id === assignmentId);
    if (idx === -1) return err(`FPPE assignment ${assignmentId} not found`);
    const updated: FppeAssignment = { ...assignments[idx], casesReviewedCount: assignments[idx].casesReviewedCount + 1 };
    if (updated.status === 'active' && endConditionMet(updated)) {
      updated.status = 'completed';
      updated.completedAt = new Date().toISOString();
      updated.completedReason = completionReason(updated);
    }
    assignments[idx] = updated;
    persist(assignments);
    return ok(updated);
  },

  async graduate(assignmentId) {
    const assignments = load();
    const idx = assignments.findIndex(a => a.id === assignmentId);
    if (idx === -1) return err(`FPPE assignment ${assignmentId} not found`);
    const updated: FppeAssignment = {
      ...assignments[idx],
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedReason: 'manually_graduated',
    };
    assignments[idx] = updated;
    persist(assignments);
    return ok(updated);
  },
};

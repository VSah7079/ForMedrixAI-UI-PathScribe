// src/services/quality/mockQaSupervisionAssignmentService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-114. Real, localStorage-backed CRUD + real in-place mutations for
// QaSupervisionAssignment - the endConditionMet/completionReason logic
// below is carried forward unchanged from mockFppeAssignmentService.ts's
// own real, working implementation, not reinvented.
//
// Real, deliberate scope for this stage: seeded with a small,
// illustrative set (an active assignment mid-progress, one completed
// via threshold, one completed via early manual graduation) proving
// the model correctly represents this archetype's own real lifecycle.
// Unlike PS-113's own Stage 2, there's no real historical seed data to
// account for later — confirmed directly: mockFppeAssignmentService.ts's
// own real seed is an empty array, not a rich, populated one.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IQaSupervisionAssignmentService } from './IQaSupervisionAssignmentService';
import type { QaSupervisionAssignment } from '@/types/quality/QaSupervisionAssignment';

const STORAGE_KEY = 'qa_supervision_assignments';

/** Real, stable id of the "Credentialing / FPPE Review" activity type -
 *  this archetype's own real, natural equivalent of PS-113's
 *  FROZEN_FINAL_ACTIVITY_TYPE_ID. Not yet backed by a real
 *  QaSupervisionAssignmentType seed record (that's part of the real
 *  migration work in a later stage) - exported now so every real
 *  future consumer can start referencing a real, stable id rather than
 *  a string literal repeated in each file. */
export const FPPE_ACTIVITY_TYPE_ID = 'qa-activity-fppe-credentialing';

/** Real, per direct follow-up ("We also should account for Cytotecs
 *  trained and new staff while we are here") — this archetype's own
 *  second real activity type, alongside FPPE_ACTIVITY_TYPE_ID above.
 *  Real, confirmed regulatory basis: CLIA '88, 42 CFR § 493.1451/1235
 *  (Subpart M) requires a lab to assess the competency of new testing
 *  personnel — which includes Cytotechnologists — twice during the
 *  first year of independent testing, then at least annually
 *  thereafter. Real, deliberate, honest scope boundary: this
 *  bounded-assignment archetype (a supervision period that graduates
 *  once an end condition is met — see QaSupervisionAssignmentType.ts)
 *  is a genuine fit for the real "twice in year one" leg of that rule
 *  (see this type's own seed record for exactly how), but NOT for the
 *  "then annually thereafter, indefinitely" leg — a recurring
 *  requirement that never graduates has no real end condition to
 *  track here and is real, separate, not-yet-built work (most likely
 *  its own periodic-reminder mechanism, not a QaSupervisionAssignment
 *  at all). Not overstating what this covers. */
export const CYTOTECH_COMPETENCY_ACTIVITY_TYPE_ID = 'qa-activity-cytotech-competency';

const SEED_ASSIGNMENTS: QaSupervisionAssignment[] = [
  // Active, mid-progress — a real, common state to demo/verify against.
  {
    id: 'qa-supervision-seed-001', activityTypeId: FPPE_ACTIVITY_TYPE_ID,
    superviseeUserId: 'PATH-UK-002', superviseeUserName: 'Oliver Pemberton',
    supervisorUserId: 'PATH-001', supervisorUserName: 'Pete Nimmo',
    subspecialtyId: 'gi',
    startedAt: '2026-07-01T00:00:00.000Z',
    endCondition: { type: 'case_count', threshold: 20 },
    casesReviewedCount: 12,
    status: 'active',
  },
  // Completed via real threshold — proves the auto-completion path.
  {
    id: 'qa-supervision-seed-002', activityTypeId: FPPE_ACTIVITY_TYPE_ID,
    superviseeUserId: 'PATH-UK-001', superviseeUserName: 'Paul Carter',
    supervisorUserId: 'PATH-001', supervisorUserName: 'Pete Nimmo',
    startedAt: '2026-04-01T00:00:00.000Z',
    endCondition: { type: 'either', caseCountThreshold: 20, durationDaysThreshold: 90 },
    casesReviewedCount: 20,
    status: 'completed', completedAt: '2026-05-30T00:00:00.000Z', completedReason: 'case_count_met',
  },
  // Completed via real manual graduation — proves the early-completion path.
  {
    id: 'qa-supervision-seed-003', activityTypeId: FPPE_ACTIVITY_TYPE_ID,
    superviseeUserId: 'PATH-001', superviseeUserName: 'Pete Nimmo',
    supervisorUserId: 'PATH-UK-002', supervisorUserName: 'Oliver Pemberton',
    subspecialtyId: 'breast',
    startedAt: '2026-01-15T00:00:00.000Z',
    endCondition: { type: 'duration_days', threshold: 90 },
    casesReviewedCount: 14,
    status: 'completed', completedAt: '2026-03-01T00:00:00.000Z', completedReason: 'manually_graduated',
  },
];

const load    = (): QaSupervisionAssignment[] => storageGet<QaSupervisionAssignment[]>(STORAGE_KEY, SEED_ASSIGNMENTS);
const persist = (data: QaSupervisionAssignment[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err = <T>(message: string): ServiceResult<T> => ({ ok: false, error: message });

/** Real end-condition check — carried forward unchanged from
 *  mockFppeAssignmentService.ts. 'either' means whichever threshold is
 *  hit first, matching the most common real supervision policy shape. */
function endConditionMet(a: QaSupervisionAssignment): boolean {
  const daysSinceStart = (Date.now() - new Date(a.startedAt).getTime()) / 86400000;
  switch (a.endCondition.type) {
    case 'case_count':    return a.casesReviewedCount >= a.endCondition.threshold;
    case 'duration_days': return daysSinceStart >= a.endCondition.threshold;
    case 'either':        return a.casesReviewedCount >= a.endCondition.caseCountThreshold || daysSinceStart >= a.endCondition.durationDaysThreshold;
  }
}
function completionReason(a: QaSupervisionAssignment): 'case_count_met' | 'duration_met' {
  if (a.endCondition.type === 'case_count') return 'case_count_met';
  if (a.endCondition.type === 'duration_days') return 'duration_met';
  return a.casesReviewedCount >= a.endCondition.caseCountThreshold ? 'case_count_met' : 'duration_met';
}

export const mockQaSupervisionAssignmentService: IQaSupervisionAssignmentService = {
  async getAll() {
    return ok([...load()]);
  },

  async getActiveAssignmentForUser(activityTypeId, userId, subspecialtyId) {
    const assignment = load().find(a =>
      a.activityTypeId === activityTypeId && a.superviseeUserId === userId && a.status === 'active'
      && (a.subspecialtyId === undefined || a.subspecialtyId === subspecialtyId)
    );
    return ok(assignment ?? null);
  },

  async create(input) {
    const newAssignment: QaSupervisionAssignment = {
      id: input.id ?? `qa-supervision-${Date.now().toString(36)}`,
      activityTypeId: input.activityTypeId,
      superviseeUserId: input.superviseeUserId,
      superviseeUserName: input.superviseeUserName,
      supervisorUserId: input.supervisorUserId,
      supervisorUserName: input.supervisorUserName,
      subspecialtyId: input.subspecialtyId,
      facilityId: input.facilityId,
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
    if (idx === -1) return err(`Supervision assignment ${assignmentId} not found`);
    const updated: QaSupervisionAssignment = { ...assignments[idx], casesReviewedCount: assignments[idx].casesReviewedCount + 1 };
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
    if (idx === -1) return err(`Supervision assignment ${assignmentId} not found`);
    const updated: QaSupervisionAssignment = {
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

import { describe, it, expect, beforeEach } from 'vitest';

// Real, minimal localStorage mock - same established pattern every
// other storage-backed service test in this app uses.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

import { mockQaSupervisionAssignmentService, FPPE_ACTIVITY_TYPE_ID } from './mockQaSupervisionAssignmentService';

describe('mockQaSupervisionAssignmentService', () => {
  it('seeds three real, illustrative assignments: active, completed-by-threshold, completed-by-graduation', async () => {
    const res = await mockQaSupervisionAssignmentService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBe(3);
    expect(res.data.filter(a => a.status === 'active').length).toBe(1);
    expect(res.data.filter(a => a.status === 'completed').length).toBe(2);
    expect(res.data.some(a => a.completedReason === 'case_count_met')).toBe(true);
    expect(res.data.some(a => a.completedReason === 'manually_graduated')).toBe(true);
  });

  it('getActiveAssignmentForUser finds the real, active assignment for the right user, activity type, and subspecialty scope', async () => {
    const res = await mockQaSupervisionAssignmentService.getActiveAssignmentForUser(FPPE_ACTIVITY_TYPE_ID, 'PATH-UK-002', 'gi');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data?.id).toBe('qa-supervision-seed-001');
  });

  it('correctly returns null when the assignment is scoped to a specific subspecialty the caller did not ask about', async () => {
    // qa-supervision-seed-001 is scoped to 'gi' specifically - a
    // caller checking with no subspecialty context (or a different
    // one) should not match it. Confirms the real, intentional
    // scoping behavior carried forward from the original FPPE service,
    // not a bug.
    const res = await mockQaSupervisionAssignmentService.getActiveAssignmentForUser(FPPE_ACTIVITY_TYPE_ID, 'PATH-UK-002');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toBeNull();
  });

  it('getActiveAssignmentForUser returns null for a user with no active assignment', async () => {
    const res = await mockQaSupervisionAssignmentService.getActiveAssignmentForUser(FPPE_ACTIVITY_TYPE_ID, 'someone-else');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toBeNull();
  });

  it('getActiveAssignmentForUser returns null for a real activity type the user has no assignment under', async () => {
    const res = await mockQaSupervisionAssignmentService.getActiveAssignmentForUser('some-other-activity-type', 'PATH-UK-002');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toBeNull();
  });

  it('create() generates a real, new active assignment starting at zero cases reviewed', async () => {
    const res = await mockQaSupervisionAssignmentService.create({
      activityTypeId: FPPE_ACTIVITY_TYPE_ID,
      superviseeUserId: 'user-new', superviseeUserName: 'Dr. New',
      supervisorUserId: 'PATH-001', supervisorUserName: 'Pete Nimmo',
      endCondition: { type: 'case_count', threshold: 10 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('active');
    expect(res.data.casesReviewedCount).toBe(0);
    expect(res.data.id).toBeTruthy();
    expect(res.data.startedAt).toBeTruthy();
  });

  it('create() uses a real, explicit id when provided, instead of auto-generating one - needed for the shared-id shadow-write from FppeAssignmentsSection.tsx', async () => {
    const res = await mockQaSupervisionAssignmentService.create({
      id: 'fppe-explicit-test-id',
      activityTypeId: FPPE_ACTIVITY_TYPE_ID,
      superviseeUserId: 'user-new', superviseeUserName: 'Dr. New',
      supervisorUserId: 'PATH-001', supervisorUserName: 'Pete Nimmo',
      endCondition: { type: 'case_count', threshold: 10 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.id).toBe('fppe-explicit-test-id');
  });

  it('recordCaseReviewed increments the real count without completing an assignment below threshold', async () => {
    const res = await mockQaSupervisionAssignmentService.recordCaseReviewed('qa-supervision-seed-001');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.casesReviewedCount).toBe(13);
    expect(res.data.status).toBe('active');
  });

  it('recordCaseReviewed auto-completes a real assignment exactly when the threshold is met', async () => {
    // Real, deliberate real-time-independent test: create a fresh
    // assignment one case short of its own real case_count threshold,
    // so this test verifies the exact transition, not a duration-based
    // side effect racing against Date.now().
    const created = await mockQaSupervisionAssignmentService.create({
      activityTypeId: FPPE_ACTIVITY_TYPE_ID,
      superviseeUserId: 'user-near-done', superviseeUserName: 'Dr. Almost',
      supervisorUserId: 'PATH-001', supervisorUserName: 'Pete Nimmo',
      endCondition: { type: 'case_count', threshold: 1 },
    });
    if (!created.ok) return;
    const res = await mockQaSupervisionAssignmentService.recordCaseReviewed(created.data.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.casesReviewedCount).toBe(1);
    expect(res.data.status).toBe('completed');
    expect(res.data.completedReason).toBe('case_count_met');
    expect(res.data.completedAt).toBeTruthy();
  });

  it('recordCaseReviewed rejects an unknown assignment id', async () => {
    const res = await mockQaSupervisionAssignmentService.recordCaseReviewed('not-real');
    expect(res.ok).toBe(false);
  });

  it('graduate() completes a real, active assignment early, regardless of real progress toward its threshold', async () => {
    const created = await mockQaSupervisionAssignmentService.create({
      activityTypeId: FPPE_ACTIVITY_TYPE_ID,
      superviseeUserId: 'user-early', superviseeUserName: 'Dr. Early',
      supervisorUserId: 'PATH-001', supervisorUserName: 'Pete Nimmo',
      endCondition: { type: 'case_count', threshold: 100 },
    });
    if (!created.ok) return;
    const res = await mockQaSupervisionAssignmentService.graduate(created.data.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('completed');
    expect(res.data.completedReason).toBe('manually_graduated');
  });

  it('graduate() rejects an unknown assignment id', async () => {
    const res = await mockQaSupervisionAssignmentService.graduate('not-real');
    expect(res.ok).toBe(false);
  });
});

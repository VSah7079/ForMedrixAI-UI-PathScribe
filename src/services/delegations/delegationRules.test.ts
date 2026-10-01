// Batch 353: the delegation decisions moved out of the Worklist, the
// Quality tab and the Delegate dialog.
import { describe, expect, it } from 'vitest';
import { informalReviewsAsDelegations, pendingDelegationsTo, planDelegation } from './delegationRules';
import type { DelegationRecord } from './IDelegationService';
import type { InformalReviewRequest } from '@/types/reports/InformalReviewRequest';

const rec = (over: Partial<DelegationRecord>): DelegationRecord => ({
  id: 'd', caseId: 'C1', fromUserId: 'A', toUserId: 'B', delegationType: 'SECOND_OPINION',
  timestamp: '2026-09-01T00:00:00Z', status: 'pending', ...over,
});

describe('delegation queries', () => {
  const records = [
    rec({ id: '1' }),
    rec({ id: '2', status: 'completed' }),
    rec({ id: '3', toUserId: 'X' }),
    rec({ id: '4', delegationType: 'CASUAL_REVIEW' }),
  ];
  it('pendingDelegationsTo: pending, sent to the user', () => {
    expect(pendingDelegationsTo(records, 'B').map(d => d.id)).toEqual(['1', '4']);
  });
});

describe('informalReviewsAsDelegations', () => {
  const review = (status: InformalReviewRequest['status']): InformalReviewRequest => ({
    id: 'r1', caseId: 'C1', fromUserId: 'A', fromUserName: 'A', toUserId: 'B', toUserName: 'B',
    status, requestedAt: '2026-09-01T00:00:00Z', publishedAt: status === 'pending' ? undefined : '2026-09-02T00:00:00Z',
  });
  it('maps a request to a CASUAL_REVIEW record; published or closed counts as completed', () => {
    expect(informalReviewsAsDelegations([review('pending')])[0]).toMatchObject({ delegationType: 'CASUAL_REVIEW', status: 'pending', timestamp: '2026-09-01T00:00:00Z' });
    expect(informalReviewsAsDelegations([review('published')])[0]).toMatchObject({ status: 'completed', completedAt: '2026-09-02T00:00:00Z' });
    expect(informalReviewsAsDelegations([review('closed')])[0].status).toBe('completed');
  });
});

describe('planDelegation', () => {
  const base = { caseId: 'C1', requestorId: 'PATH-001' };
  it('assigns the chosen synoptic to a user', () => {
    expect(planDelegation({ ...base, delegationType: 'SYNOPTIC_ASSIGN', recipient: { kind: 'user', id: 'U2', name: 'Dr Two' }, synopticInstanceId: 'I1', note: 'please' }))
      .toEqual({ kind: 'assignSynoptic', caseId: 'C1', instanceId: 'I1', assignedTo: 'U2', assignedToName: 'Dr Two', assignedBy: 'PATH-001', requiresCountersign: true, note: 'please' });
  });
  it('without a chosen synoptic, SYNOPTIC_ASSIGN delegates the case (as the dialog always did)', () => {
    expect(planDelegation({ ...base, delegationType: 'SYNOPTIC_ASSIGN', recipient: { kind: 'user', id: 'U2' } }).kind).toBe('delegateCase');
  });
  it('delegates to a user or a pool; a blank note is dropped', () => {
    expect(planDelegation({ ...base, delegationType: 'SECOND_OPINION', recipient: { kind: 'user', id: 'U2', name: 'Dr Two' }, note: '  ' }))
      .toEqual({ kind: 'delegateCase', payload: { caseId: 'C1', requestorId: 'PATH-001', delegationType: 'SECOND_OPINION', targetUserId: 'U2', targetUserName: 'Dr Two', note: undefined } });
    expect(planDelegation({ ...base, delegationType: 'POOL', recipient: { kind: 'pool', id: 'P1', name: 'GI' } }))
      .toEqual({ kind: 'delegateCase', payload: { caseId: 'C1', requestorId: 'PATH-001', delegationType: 'POOL', targetPoolId: 'P1', targetPoolName: 'GI', note: undefined } });
  });
});

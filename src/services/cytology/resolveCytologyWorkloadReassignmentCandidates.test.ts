// src/services/cytology/resolveCytologyWorkloadReassignmentCandidates.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyWorkloadReassignmentCandidates } from './resolveCytologyWorkloadReassignmentCandidates';
import type { Case } from '@/types/case/Case';

const makeCase = (id: string, assignedTo: string | null, status: string): Case =>
  ({ id, status, order: { assignedTo } } as any);

describe('resolveCytologyWorkloadReassignmentCandidates — real, per direct guidance\'s own Phase 2 reassignment specification', () => {
  it('a case genuinely assigned to this user and still in-progress is a real candidate', () => {
    const cases = [makeCase('c1', 'CT-001', 'in-progress')];
    expect(resolveCytologyWorkloadReassignmentCandidates(cases, 'CT-001').map(c => c.id)).toEqual(['c1']);
  });

  it('a case assigned to a DIFFERENT user is never a candidate — only this user\'s own real queue', () => {
    const cases = [makeCase('c1', 'CT-002', 'in-progress')];
    expect(resolveCytologyWorkloadReassignmentCandidates(cases, 'CT-001')).toEqual([]);
  });

  it('a real, unassigned pool case is never a candidate — nothing to reassign away from', () => {
    const cases = [makeCase('c1', null, 'pool')];
    expect(resolveCytologyWorkloadReassignmentCandidates(cases, 'CT-001')).toEqual([]);
  });

  it('multiple real cases still in this user\'s own queue are all identified — the real "remaining queue items" direct guidance describes', () => {
    const cases = [
      makeCase('c1', 'CT-001', 'in-progress'),
      makeCase('c2', 'CT-001', 'in-progress'),
      makeCase('c3', 'CT-002', 'in-progress'),
    ];
    expect(resolveCytologyWorkloadReassignmentCandidates(cases, 'CT-001').map(c => c.id).sort()).toEqual(['c1', 'c2']);
  });
});

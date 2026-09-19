// src/services/cases/resolveResidentCountersignRequired.test.ts
import { describe, it, expect } from 'vitest';
import { resolveResidentCountersignRequired } from './resolveResidentCountersignRequired';
import type { CaseParticipant } from '@/types/case/Case';

function participant(overrides: Partial<CaseParticipant> = {}): CaseParticipant {
  return {
    staffId: 'user-1',
    status: 'active',
    participationTypeIds: [],
    ...overrides,
  } as CaseParticipant;
}

describe('resolveResidentCountersignRequired', () => {
  it('requires countersign for an active resident participant with no attending role', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['resident'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
    });
    expect(result).toEqual({ required: true, reason: 'resident' });
  });

  it('requires countersign for an active FPPE assignment with no attending role', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['provisional_hire'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: true,
    });
    expect(result).toEqual({ required: true, reason: 'fppe' });
  });

  it('never intercepts a dual-role signer who is also an active attending participant, even with a resident type present', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['resident', 'attending'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
    });
    expect(result).toEqual({ required: false });
  });

  it('never intercepts a dual-role signer who is also an active attending participant, even with an active FPPE assignment', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['attending'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: true,
    });
    expect(result).toEqual({ required: false });
  });

  it('does not require countersign for a plain attending with no resident type and no FPPE assignment', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['attending'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
    });
    expect(result).toEqual({ required: false });
  });

  it('does not require countersign when there are no participants at all', () => {
    const result = resolveResidentCountersignRequired({
      participants: undefined,
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
    });
    expect(result).toEqual({ required: false });
  });

  it('ignores an inactive resident participant', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['resident'], status: 'removed' as any })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
    });
    expect(result).toEqual({ required: false });
  });

  it('ignores a resident participant record belonging to a different user', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['resident'], staffId: 'someone-else' })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
    });
    expect(result).toEqual({ required: false });
  });
});

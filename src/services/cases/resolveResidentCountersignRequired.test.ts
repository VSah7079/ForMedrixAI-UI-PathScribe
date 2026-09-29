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

  it('requires countersign for a cytotechnologist participant with an active competency assessment assignment', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['cytotechnologist'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
      hasActiveCytotechCompetencyAssignment: true,
    });
    expect(result).toEqual({ required: true, reason: 'cytotech_competency' });
  });

  it('does not intercept a cytotechnologist participant when there is no active competency assessment assignment', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['cytotechnologist'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
      hasActiveCytotechCompetencyAssignment: false,
    });
    expect(result).toEqual({ required: false });
  });

  it('does not intercept a cytotechnologist participant when hasActiveCytotechCompetencyAssignment is omitted (existing Surg Path/Autopsy callers never pass it)', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['cytotechnologist'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
    });
    expect(result).toEqual({ required: false });
  });

  it('never intercepts a dual-role signer who is also an active attending participant, even with an active cytotech competency assignment', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['cytotechnologist', 'attending'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
      hasActiveCytotechCompetencyAssignment: true,
    });
    expect(result).toEqual({ required: false });
  });

  it('prefers the resident reason over cytotech_competency when a signer somehow carries both types with an active competency assignment', () => {
    const result = resolveResidentCountersignRequired({
      participants: [participant({ participationTypeIds: ['resident', 'cytotechnologist'] })],
      signingUserId: 'user-1',
      hasActiveFppeAssignment: false,
      hasActiveCytotechCompetencyAssignment: true,
    });
    expect(result).toEqual({ required: true, reason: 'resident' });
  });

  // PS-327 — countersignRequiredTypeIds (the requiresCountersign
  // counterpart to the hardcoded resident/cytotechnologist checks above,
  // resolved per-lab by the caller via
  // resolveCountersignRequiredTypeIds()/resolveParticipationTypeAuthority()).
  describe('countersignRequiredTypeIds (PS-327 — admin-configured requiresCountersign types)', () => {
    it('requires countersign for a participant holding an admin-configured type id present in countersignRequiredTypeIds', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['junior_registrar'] })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
        countersignRequiredTypeIds: ['junior_registrar'],
      });
      expect(result).toEqual({ required: true, reason: 'configured_type' });
    });

    it('does not intercept a type id that is not in countersignRequiredTypeIds', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['consultant'] })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
        countersignRequiredTypeIds: ['junior_registrar'],
      });
      expect(result).toEqual({ required: false });
    });

    it('regression-safe by construction: omitting countersignRequiredTypeIds entirely behaves identically to before this field existed', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['junior_registrar'] })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
      });
      expect(result).toEqual({ required: false });
    });

    it('regression-safe by construction: an empty countersignRequiredTypeIds array (no lab override, no platform-default requiresCountersign type) behaves identically to omitting it', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['junior_registrar'] })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
        countersignRequiredTypeIds: [],
      });
      expect(result).toEqual({ required: false });
    });

    it('never intercepts a dual-role signer who is also an active attending participant, even when their other type is in countersignRequiredTypeIds', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['junior_registrar', 'attending'] })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
        countersignRequiredTypeIds: ['junior_registrar'],
      });
      expect(result).toEqual({ required: false });
    });

    it('is purely additive for the built-in resident type — the hardcoded isResidentParticipant check still matches first, so the reason stays "resident" even when the caller also resolves it into countersignRequiredTypeIds', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['resident'] })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
        countersignRequiredTypeIds: ['resident'],
      });
      expect(result).toEqual({ required: true, reason: 'resident' });
    });

    it('ignores an inactive participant even when their type is in countersignRequiredTypeIds', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['junior_registrar'], status: 'removed' as any })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
        countersignRequiredTypeIds: ['junior_registrar'],
      });
      expect(result).toEqual({ required: false });
    });

    it('ignores a matching-type participant record belonging to a different user', () => {
      const result = resolveResidentCountersignRequired({
        participants: [participant({ participationTypeIds: ['junior_registrar'], staffId: 'someone-else' })],
        signingUserId: 'user-1',
        hasActiveFppeAssignment: false,
        countersignRequiredTypeIds: ['junior_registrar'],
      });
      expect(result).toEqual({ required: false });
    });
  });
});

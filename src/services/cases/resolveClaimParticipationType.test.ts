// src/services/cases/resolveClaimParticipationType.test.ts
import { describe, it, expect } from 'vitest';
import { resolveClaimParticipationType } from './resolveClaimParticipationType';
import type { Role } from '@/services/roles/IRoleService';
import type { ParticipationTypeRecord } from '@/services/participationTypes/IParticipationTypeService';

function makeRole(over: Partial<Role> = {}): Role {
  return {
    id: 'role-1', name: 'Resident', description: '', color: '#fff',
    caseAccess: true, configAccess: false, canViewPediatric: false,
    participationTypeIds: ['resident'],
    ...over,
  } as Role;
}

function makeType(over: Partial<ParticipationTypeRecord> = {}): ParticipationTypeRecord {
  return {
    id: 'primary', label: 'Attending / Primary Pathologist', description: '', color: '#fff',
    allowsMultiple: false, requiresNote: false, active: true, isSystem: true, sortOrder: 1,
    canFinalize: true,
    ...over,
  } as ParticipationTypeRecord;
}

const TYPES: ParticipationTypeRecord[] = [
  makeType({ id: 'primary', sortOrder: 1, canFinalize: true }),
  makeType({ id: 'resident', label: 'Resident / Fellow', sortOrder: 2, canFinalize: false }),
  makeType({ id: 'attending', label: 'Co-Signer / Supervisor', sortOrder: 3, canFinalize: true }),
  makeType({ id: 'cytotechnologist', label: 'Cytotechnologist', sortOrder: 5, canFinalize: false }),
];

describe('resolveClaimParticipationType — real, role-derived claim tagging', () => {
  it('defaults to primary when the staff member has no matching Role at all (unchanged prior behavior)', () => {
    expect(resolveClaimParticipationType(['Some Unrelated Title'], [], TYPES)).toBe('primary');
    expect(resolveClaimParticipationType(undefined, [makeRole()], TYPES)).toBe('primary');
  });

  it('defaults to primary when the matching Role carries no participationTypeIds', () => {
    const role = makeRole({ name: 'Billing Clerk', participationTypeIds: undefined });
    expect(resolveClaimParticipationType(['Billing Clerk'], [role], TYPES)).toBe('primary');
  });

  it('tags a resident as resident, never silently as primary/Attending', () => {
    const role = makeRole({ name: 'Resident', participationTypeIds: ['resident'] });
    expect(resolveClaimParticipationType(['Resident'], [role], TYPES)).toBe('resident');
  });

  it('tags a cytotechnologist as cytotechnologist, never silently as primary/Attending', () => {
    const role = makeRole({ name: 'Cytotechnologist', participationTypeIds: ['cytotechnologist'] });
    expect(resolveClaimParticipationType(['Cytotechnologist'], [role], TYPES)).toBe('cytotechnologist');
  });

  it('tags a genuine attending as primary, when primary is their only real eligibility', () => {
    const role = makeRole({ name: 'Pathologist', participationTypeIds: ['primary', 'attending'] });
    expect(resolveClaimParticipationType(['Pathologist'], [role], TYPES)).toBe('primary');
  });

  it('when eligible for both a finalizing and a non-finalizing type, picks the non-finalizing one', () => {
    // A dual-credentialed staff member should never default to the more
    // privileged type just because they're technically eligible for it.
    const role = makeRole({ name: 'Dual', participationTypeIds: ['resident', 'primary'] });
    expect(resolveClaimParticipationType(['Dual'], [role], TYPES)).toBe('resident');
  });

  it('respects a lab-level authorityOverride when picking the least-privileged eligible type', () => {
    const overriddenTypes: ParticipationTypeRecord[] = [
      makeType({ id: 'primary', sortOrder: 1, canFinalize: true }),
      makeType({
        id: 'attending', label: 'Co-Signer / Supervisor', sortOrder: 3, canFinalize: true,
        authorityOverrides: { 'lab-1': { canFinalize: false } },
      }),
    ];
    const role = makeRole({ name: 'Pathologist', participationTypeIds: ['primary', 'attending'] });
    // Without the override, both are finalizing, so lowest sortOrder (primary) wins.
    expect(resolveClaimParticipationType(['Pathologist'], [role], overriddenTypes)).toBe('primary');
    // With the override applied at this lab, 'attending' becomes the
    // real, only non-finalizing eligible option there.
    expect(resolveClaimParticipationType(['Pathologist'], [role], overriddenTypes, 'lab-1')).toBe('attending');
  });
});

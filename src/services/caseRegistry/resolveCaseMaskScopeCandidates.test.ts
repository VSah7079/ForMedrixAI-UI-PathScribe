// src/services/caseRegistry/resolveCaseMaskScopeCandidates.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCaseMaskScopeCandidates } from './resolveCaseMaskScopeCandidates';
import type { Facility } from '../facilities/IFacilityService';

function makeFacility(overrides: Partial<Facility>): Facility {
  return {
    id: 'f-default', name: 'Test Facility', assigningAuthority: 'TEST',
    address: '', phone: '', fax: '', email: '',
    roles: ['performing_lab'], status: 'Active',
    ...overrides,
  } as Facility;
}

describe('resolveCaseMaskScopeCandidates — real, ordered scope resolution for a case', () => {
  it('returns no candidates when neither a department nor a performing lab is resolved', () => {
    const result = resolveCaseMaskScopeCandidates(undefined, undefined, []);
    expect(result).toEqual([]);
  });

  it('returns only a department candidate when no performing lab is resolved', () => {
    const result = resolveCaseMaskScopeCandidates('cat-surgical-tissue', undefined, []);
    expect(result).toEqual([{ scopeType: 'department', scopeId: 'cat-surgical-tissue' }]);
  });

  it('returns facility then enterprise, in order, when the lab is a child of a real Enterprise', () => {
    const enterprise = makeFacility({ id: 'ent-1', isEnterprise: true });
    const lab = makeFacility({ id: 'lab-1', parentId: 'ent-1' });
    const result = resolveCaseMaskScopeCandidates(undefined, lab, [enterprise, lab]);
    expect(result).toEqual([
      { scopeType: 'facility', scopeId: 'lab-1' },
      { scopeType: 'enterprise', scopeId: 'ent-1' },
    ]);
  });

  it('returns only a single facility candidate, never a duplicate enterprise entry, when the performing lab is itself the Enterprise', () => {
    const enterpriseLab = makeFacility({ id: 'ent-lab-1', isEnterprise: true });
    const result = resolveCaseMaskScopeCandidates(undefined, enterpriseLab, [enterpriseLab]);
    expect(result).toEqual([{ scopeType: 'facility', scopeId: 'ent-lab-1' }]);
  });

  it('returns only a facility candidate when the lab has no parentId at all — no real Enterprise to walk to', () => {
    const standaloneLab = makeFacility({ id: 'lab-standalone' });
    const result = resolveCaseMaskScopeCandidates(undefined, standaloneLab, [standaloneLab]);
    expect(result).toEqual([{ scopeType: 'facility', scopeId: 'lab-standalone' }]);
  });

  it('returns only a facility candidate when parentId points at a facility that is not actually in the given list', () => {
    const lab = makeFacility({ id: 'lab-orphan', parentId: 'ent-missing' });
    const result = resolveCaseMaskScopeCandidates(undefined, lab, [lab]);
    expect(result).toEqual([{ scopeType: 'facility', scopeId: 'lab-orphan' }]);
  });

  it('returns all three candidates, department first, when both a department and a full facility chain are resolved', () => {
    const enterprise = makeFacility({ id: 'ent-2', isEnterprise: true });
    const lab = makeFacility({ id: 'lab-2', parentId: 'ent-2' });
    const result = resolveCaseMaskScopeCandidates('cat-fluid-cytology', lab, [enterprise, lab]);
    expect(result).toEqual([
      { scopeType: 'department', scopeId: 'cat-fluid-cytology' },
      { scopeType: 'facility', scopeId: 'lab-2' },
      { scopeType: 'enterprise', scopeId: 'ent-2' },
    ]);
  });
});

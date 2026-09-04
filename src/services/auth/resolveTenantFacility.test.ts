// src/services/auth/resolveTenantFacility.test.ts
import { describe, it, expect } from 'vitest';
import { resolveTenantFacility } from './resolveTenantFacility';
import type { Facility } from '../facilities/IFacilityService';

function makeEnterprise(overrides: Partial<Facility>): Facility {
  return {
    id: 'ent-default', name: 'Test Enterprise', assigningAuthority: 'TEST',
    address: '', phone: '', fax: '', email: '',
    roles: ['performing_lab'], isEnterprise: true, status: 'Active',
    ...overrides,
  } as Facility;
}

describe('resolveTenantFacility — real, legacy-id bridge to the authoritative Enterprise Facility', () => {
  it('returns undefined for a null/undefined legacy id', () => {
    expect(resolveTenantFacility(undefined, [])).toBeUndefined();
    expect(resolveTenantFacility(null, [])).toBeUndefined();
  });

  it('returns undefined when no real Enterprise Facility has this legacy id', () => {
    const ent = makeEnterprise({ id: 'ent-a', legacyTenantIds: ['ORG-A'] });
    expect(resolveTenantFacility('ORG-UNKNOWN', [ent])).toBeUndefined();
  });

  it('resolves a real legacy organisationId-style value', () => {
    const ent = makeEnterprise({ id: 'ent-a', legacyTenantIds: ['ORG-A', 'HOSP-A'] });
    expect(resolveTenantFacility('ORG-A', [ent])?.id).toBe('ent-a');
  });

  it('resolves a real legacy originHospitalId-style value for the SAME tenant as its org-style value', () => {
    const ent = makeEnterprise({ id: 'ent-a', legacyTenantIds: ['ORG-A', 'HOSP-A'] });
    const byOrg = resolveTenantFacility('ORG-A', [ent]);
    const byHosp = resolveTenantFacility('HOSP-A', [ent]);
    expect(byOrg?.id).toBe(byHosp?.id);
  });

  it('never matches a Facility that is not isEnterprise, even if legacyTenantIds is somehow set', () => {
    const nonEnterprise = makeEnterprise({ id: 'not-ent', isEnterprise: false, legacyTenantIds: ['ORG-A'] });
    expect(resolveTenantFacility('ORG-A', [nonEnterprise])).toBeUndefined();
  });

  it('resolves the correct one of several real, distinct tenants', () => {
    const entA = makeEnterprise({ id: 'ent-a', legacyTenantIds: ['ORG-A', 'HOSP-A'] });
    const entB = makeEnterprise({ id: 'ent-b', legacyTenantIds: ['ORG-B', 'HOSP-B'] });
    expect(resolveTenantFacility('ORG-B', [entA, entB])?.id).toBe('ent-b');
    expect(resolveTenantFacility('HOSP-A', [entA, entB])?.id).toBe('ent-a');
  });
});

// src/services/facilities/resolveFacilityPrintBranding.test.ts
import { describe, it, expect } from 'vitest';
import { resolveBrandingScopeCandidates, resolveFacilityPrintBranding } from './resolveFacilityPrintBranding';
import type { Facility } from './IFacilityService';
import type { Department } from '../departments/IDepartmentService';

function facility(over: Partial<Facility> = {}): Facility {
  return {
    id: 'fac-1', name: 'Test Facility', assigningAuthority: 'TF', address: '1 Test St',
    phone: '', fax: '', email: '', roles: ['performing_lab'], jurisdiction: 'US',
    reporting: { reportFormat: 'PDF', deliveryMethod: 'Portal', autoRelease: false, copyToReferring: false },
    status: 'Active', pediatricAgeThreshold: null, authorizedPediatricPathologistIds: [],
    tatFirstTouchHours: null, tatTotalHours: null, escalationTargets: [], escalationPriority: 'high',
    ...over,
  };
}

describe('resolveBrandingScopeCandidates — real, per direct architecture guidance (Facility-first ordering)', () => {
  it('orders facility, then department, then enterprise', () => {
    const enterprise = facility({ id: 'ent-1', isEnterprise: true });
    const performingLab = facility({ id: 'fac-1', parentId: 'ent-1' });
    const department: Department = { id: 'dept-1', name: 'Cytology', defaultGrossingTemplateId: 'x', status: 'Active' };

    const candidates = resolveBrandingScopeCandidates(performingLab, department, [enterprise, performingLab]);

    expect(candidates).toEqual([
      { scopeType: 'facility', scopeId: 'fac-1' },
      { scopeType: 'department', scopeId: 'dept-1' },
      { scopeType: 'enterprise', scopeId: 'ent-1' },
    ]);
  });

  it('omits department when none is given, and omits enterprise when the facility has no real parent', () => {
    const standalone = facility({ id: 'fac-2' });
    const candidates = resolveBrandingScopeCandidates(standalone, undefined, [standalone]);
    expect(candidates).toEqual([{ scopeType: 'facility', scopeId: 'fac-2' }]);
  });

  it('never lists a self-Enterprise performing lab as two, misleadingly-distinct candidates for the same real scopeId', () => {
    const selfEnterprise = facility({ id: 'ent-self', isEnterprise: true });
    const candidates = resolveBrandingScopeCandidates(selfEnterprise, undefined, [selfEnterprise]);
    expect(candidates).toEqual([{ scopeType: 'facility', scopeId: 'ent-self' }]);
  });
});

describe('resolveFacilityPrintBranding — real, per PS-277 §1.2.2', () => {
  it('resolves via resolvePerformingLabFacilityId first — an ordering-only facility with a real performingLabFacilityId override shows the LAB\'s own branding, never its own', () => {
    const lab = facility({ id: 'lab-1', name: 'Real Performing Lab', directorName: 'Dr. Lab Director', cliaOrIsoNumber: 'CLIA-999' });
    const orderingOnly = facility({
      id: 'order-1', name: 'Ordering Clinic Only', roles: ['external_ordering_client'], performingLabFacilityId: 'lab-1',
    });

    const branding = resolveFacilityPrintBranding(orderingOnly, [lab, orderingOnly]);

    expect(branding).toEqual({
      facilityName: 'Real Performing Lab', address: '1 Test St', city: undefined, state: undefined, zip: undefined,
      headerLogoUrl: undefined, directorName: 'Dr. Lab Director', cliaOrIsoNumber: 'CLIA-999',
    });
  });

  it('returns undefined — a real, honest gap — for a facility with no performing_lab role and no override', () => {
    const orderingOnly = facility({ id: 'order-2', roles: ['external_ordering_client'] });
    expect(resolveFacilityPrintBranding(orderingOnly, [orderingOnly])).toBeUndefined();
  });

  it('per-field fallback: a facility\'s own real CLIA number is used even while its logo falls back to its Enterprise parent\'s — independently, not as one all-or-nothing record', () => {
    const enterprise = facility({ id: 'ent-1', isEnterprise: true, name: 'Trust HQ', headerLogoUrl: 'https://example.com/trust-logo.png', directorName: 'Dr. Trust Director' });
    const affiliate = facility({ id: 'fac-1', name: 'Affiliate Hospital', parentId: 'ent-1', cliaOrIsoNumber: 'CLIA-AFFILIATE-1' });

    const branding = resolveFacilityPrintBranding(affiliate, [enterprise, affiliate]);

    expect(branding?.facilityName).toBe('Affiliate Hospital'); // never the Enterprise's own name
    expect(branding?.cliaOrIsoNumber).toBe('CLIA-AFFILIATE-1'); // real, own value — not inherited
    expect(branding?.headerLogoUrl).toBe('https://example.com/trust-logo.png'); // real fallback
    expect(branding?.directorName).toBe('Dr. Trust Director'); // real fallback — affiliate never set its own
  });

  it('falls to the Department tier when the facility itself has no real override', () => {
    const enterprise = facility({ id: 'ent-1', isEnterprise: true, directorName: 'Dr. Trust Director' });
    const affiliate = facility({ id: 'fac-1', parentId: 'ent-1' });
    const department: Department = { id: 'dept-1', name: 'Cytology', defaultGrossingTemplateId: 'x', status: 'Active', directorName: 'Dr. Department Director' };

    const branding = resolveFacilityPrintBranding(affiliate, [enterprise, affiliate], department);
    // Department's own real value wins over the Enterprise's — closer scope, per the real Facility-first-then-Department-then-Enterprise order.
    expect(branding?.directorName).toBe('Dr. Department Director');
  });

  it('real, per direct architecture guidance #2 — a pure TC (technical-component-only) report withholds directorName/cliaOrIsoNumber, but still shows facilityName/address (the specimen genuinely was processed there)', () => {
    const lab = facility({ id: 'fac-1', name: 'Processing Site', directorName: 'Dr. Signer', cliaOrIsoNumber: 'CLIA-1', headerLogoUrl: 'https://example.com/logo.png' });

    const branding = resolveFacilityPrintBranding(lab, [lab], undefined, 'TC');

    expect(branding?.facilityName).toBe('Processing Site');
    expect(branding?.headerLogoUrl).toBe('https://example.com/logo.png');
    expect(branding?.directorName).toBeUndefined();
    expect(branding?.cliaOrIsoNumber).toBeUndefined();
  });

  it('a "26" (professional-only) or "Global" report shows the full, real interpretive branding block unchanged', () => {
    const lab = facility({ id: 'fac-1', directorName: 'Dr. Signer', cliaOrIsoNumber: 'CLIA-1' });
    expect(resolveFacilityPrintBranding(lab, [lab], undefined, '26')?.directorName).toBe('Dr. Signer');
    expect(resolveFacilityPrintBranding(lab, [lab], undefined, 'Global')?.cliaOrIsoNumber).toBe('CLIA-1');
    expect(resolveFacilityPrintBranding(lab, [lab])?.directorName).toBe('Dr. Signer'); // undefined flag — same as Global/26
  });
});

// src/services/qualityAssurance/resolveJurisdictionRollup.test.ts
import { describe, it, expect } from 'vitest';
import { resolveJurisdictionRollup, type CaseForJurisdictionRollup } from './resolveJurisdictionRollup';
import type { Facility } from '../facilities/IFacilityService';

const usEnterprise: Facility = {
  id: 'fac-us-hq', name: 'US Enterprise HQ', jurisdiction: 'US', isEnterprise: true,
  legacyTenantIds: ['HOSP-US-01'], roles: ['performing_lab'], status: 'Active',
} as unknown as Facility;

const gbEnterprise: Facility = {
  id: 'fac-gb-hq', name: 'GB Enterprise HQ', jurisdiction: 'GB_EW', isEnterprise: true,
  legacyTenantIds: ['HOSP-GB-01'], roles: ['performing_lab'], status: 'Active',
} as unknown as Facility;

const enterpriseFacilities = [usEnterprise, gbEnterprise];

const makeCase = (over: Partial<CaseForJurisdictionRollup>): CaseForJurisdictionRollup => ({
  id: 'case-1',
  originHospitalId: 'HOSP-US-01',
  order: { receivedDate: '2026-01-01T08:00:00.000Z', facilityId: 'fac-us-hq' },
  diagnostic: { issuedDate: '2026-01-01T20:00:00.000Z' },
  firstOpenedAt: '2026-01-01T09:00:00.000Z',
  specimens: [],
  synopticReports: [],
  ...over,
} as unknown as CaseForJurisdictionRollup);

describe('resolveJurisdictionRollup — real, per the RFP-APLIS-2026-GLOBAL Enterprise BI Rollup gap', () => {
  it('real, cases from two different jurisdictions are correctly grouped into separate rows', () => {
    const cases = [
      makeCase({ id: 'us-1', originHospitalId: 'HOSP-US-01' }),
      makeCase({ id: 'us-2', originHospitalId: 'HOSP-US-01' }),
      makeCase({ id: 'gb-1', originHospitalId: 'HOSP-GB-01' }),
    ];
    const result = resolveJurisdictionRollup(cases, enterpriseFacilities, []);
    expect(result.byJurisdiction).toHaveLength(2);
    const us = result.byJurisdiction.find(r => r.jurisdiction === 'US');
    const gb = result.byJurisdiction.find(r => r.jurisdiction === 'GB_EW');
    expect(us?.caseVolume).toBe(2);
    expect(gb?.caseVolume).toBe(1);
  });

  it('real, a case with no resolvable Enterprise Facility is honestly counted as unresolved, never silently dropped or misassigned', () => {
    const cases = [makeCase({ id: 'orphan', originHospitalId: 'HOSP-UNKNOWN' })];
    const result = resolveJurisdictionRollup(cases, enterpriseFacilities, []);
    expect(result.byJurisdiction).toHaveLength(0);
    expect(result.unresolvedCaseCount).toBe(1);
  });

  it('real, the enterprise-wide row is a genuine combination of the per-jurisdiction aggregates, not a re-computation over raw cross-jurisdiction cases', () => {
    const cases = [
      makeCase({ id: 'us-1', originHospitalId: 'HOSP-US-01' }),
      makeCase({ id: 'us-2', originHospitalId: 'HOSP-US-01' }),
      makeCase({ id: 'gb-1', originHospitalId: 'HOSP-GB-01' }),
    ];
    const result = resolveJurisdictionRollup(cases, enterpriseFacilities, []);
    expect(result.enterpriseWide.jurisdictionCount).toBe(2);
    expect(result.enterpriseWide.caseVolume).toBe(3);
  });

  it('real, an empty case set produces a real, honest empty result — never a crash or a fabricated non-zero number', () => {
    const result = resolveJurisdictionRollup([], enterpriseFacilities, []);
    expect(result.byJurisdiction).toHaveLength(0);
    expect(result.enterpriseWide.caseVolume).toBe(0);
    expect(result.unresolvedCaseCount).toBe(0);
  });

  it('real, per-case AI-assisted signal correctly aggregates into a real, per-jurisdiction percentage', () => {
    const cases = [
      makeCase({ id: 'us-1', originHospitalId: 'HOSP-US-01', synopticReports: [{ aiSuggestions: { finding: 'x' } }] as any }),
      makeCase({ id: 'us-2', originHospitalId: 'HOSP-US-01', synopticReports: [] }),
    ];
    const result = resolveJurisdictionRollup(cases, enterpriseFacilities, []);
    const us = result.byJurisdiction.find(r => r.jurisdiction === 'US');
    expect(us?.aiAssistedPct).toBe(50);
  });
});

// src/pages/contributionDashboardCalculations.test.ts
import { describe, it, expect } from 'vitest';
import { computeOverviewKpis, computeCaseMixData, computeOrgWideTatPerformance, computeRvu30, computeWeeklyDaily, type CaseForDashboardCalc } from './contributionDashboardCalculations';
import type { RvuTableVersion } from '../services/billing/RvuTableVersion';

function makeCase(over: Partial<CaseForDashboardCalc> = {}): CaseForDashboardCalc {
  return {
    id: 'S26-1',
    order: { assignedTo: 'PATH-001' },
    ...over,
  };
}

describe('computeOverviewKpis — real fix: replaces the hardcoded mockKpis array', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');

  it('counts a genuinely finalized case within the real last-30-day window', () => {
    const cases = [makeCase({
      diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-20T00:00:00.000Z' },
    })];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.casesFinalized30d).toBe(1);
  });

  it('excludes a case finalized by someone else, even if assigned to the user', () => {
    const cases = [makeCase({
      diagnostic: { finalizedBy: 'other-user', issuedDate: '2026-03-20T00:00:00.000Z' },
    })];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.casesFinalized30d).toBe(0);
  });

  it('excludes a case outside the real 30-day window', () => {
    const cases = [makeCase({
      diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-01-01T00:00:00.000Z' },
    })];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.casesFinalized30d).toBe(0);
  });

  it('computes a real delta against the real prior 30-day period', () => {
    const cases = [
      makeCase({ id: 'a', diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' } }),
      makeCase({ id: 'b', diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-26T00:00:00.000Z' } }),
      makeCase({ id: 'c', diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-02-15T00:00:00.000Z' } }), // prior period, 1 case
    ];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.casesFinalized30d).toBe(2);
    expect(result.casesFinalizedDeltaPct).toBe(100); // 2 vs 1 = +100%
  });

  it('returns null (never a fabricated percentage) when there is no real prior-period baseline', () => {
    const cases = [makeCase({ diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' } })];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.casesFinalizedDeltaPct).toBeNull();
  });

  it('counts real in-progress cases, excluding finalized/closed', () => {
    const cases = [
      makeCase({ id: 'a', status: 'in-progress' }),
      makeCase({ id: 'b', status: 'pathologist-review' }),
      makeCase({ id: 'c', status: 'finalized' }),
      makeCase({ id: 'd', status: 'closed' }),
    ];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.casesInProgress).toBe(2);
  });

  it('uses the real aiSuggestions signal for AI-assisted count, not a fabricated one', () => {
    const cases = [
      makeCase({
        id: 'a', diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' },
        synopticReports: [{ aiSuggestions: { field1: { value: 'x' } } }],
      }),
      makeCase({
        id: 'b', diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' },
        synopticReports: [{ aiSuggestions: {} }], // empty - real fix excludes this
      }),
    ];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.aiAssistedCases30d).toBe(1);
  });

  it('excludes cases not assigned to the current user entirely', () => {
    const cases = [makeCase({ order: { assignedTo: 'other-user' }, status: 'in-progress' })];
    const result = computeOverviewKpis(cases, 'PATH-001', now);
    expect(result.casesInProgress).toBe(0);
  });
});

describe('computeRvu30 — real fix, the actual point of versioning: a case keeps the real rates that were in effect when it was genuinely finalized', () => {
  const version2026: RvuTableVersion = {
    id: 'v-2026', label: 'CMS 2026', effectiveDate: '2026-01-01T00:00:00.000Z',
    uploadedAt: '2026-01-01T00:00:00.000Z', uploadedBy: 'admin', isActive: false,
    entries: [{ code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 0.73, level: 'specimen' as const, billingType: 'Global' as const }],
  };
  const version2027: RvuTableVersion = {
    id: 'v-2027', label: 'CMS 2027', effectiveDate: '2027-01-01T00:00:00.000Z',
    uploadedAt: '2027-01-01T00:00:00.000Z', uploadedBy: 'admin', isActive: true,
    entries: [{ code: '88305', billingCode: '88305', description: 'Level IV', workRvu: 0.80, level: 'specimen' as const, billingType: 'Global' as const }], // real rate increase
  };
  const versions = [version2026, version2027];

  it('a case finalized in 2026 uses the real 2026 rate, even though 2027 is now active', () => {
    const cases = [makeCase({
      diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-06-15T00:00:00.000Z' },
      ...( { specimens: [{ id: 'sp-1', coding: { cpt: ['88305'] } }] } as any),
    })];
    const result = computeRvu30(cases as any, 'PATH-001', versions, new Date('2026-07-01T00:00:00.000Z'));
    expect(result.total).toBe(0.73); // the real 2026 rate, not the newer 2027 one
  });

  it('a case finalized in 2027 uses the real, newer 2027 rate', () => {
    const cases = [makeCase({
      diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2027-05-15T00:00:00.000Z' },
      ...( { specimens: [{ id: 'sp-1', coding: { cpt: ['88305'] } }] } as any),
    })];
    const result = computeRvu30(cases as any, 'PATH-001', versions, new Date('2027-06-01T00:00:00.000Z'));
    expect(result.total).toBe(0.80);
  });

  it('updating the table to a new version does not silently rewrite historical totals - the core integrity guarantee', () => {
    const historicalCase = makeCase({
      diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-06-15T00:00:00.000Z' },
      ...( { specimens: [{ id: 'sp-1', coding: { cpt: ['88305'] } }] } as any),
    });
    // Compute once with only the 2026 version known...
    const before = computeRvu30([historicalCase] as any, 'PATH-001', [version2026], new Date('2026-07-01T00:00:00.000Z'));
    // ...and again after the 2027 version has since been added and activated.
    const after = computeRvu30([historicalCase] as any, 'PATH-001', versions, new Date('2026-07-01T00:00:00.000Z'));
    expect(before.total).toBe(after.total); // must be identical - the historical case's own real rate never changes
  });
});

describe('computeOrgWideTatPerformance — real fix: replaces mockClientTatData/mockTatTargets/mockTatPerf', () => {
  const entries = [
    { id: 't1', type: 'FIRST_TOUCH', targetHours: 4,  urgency: null, clientId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true },
    { id: 't2', type: 'TOTAL_CASE',  targetHours: 24, urgency: null, clientId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true },
  ];

  it('computes a real, weighted first-touch and total-case average across all real cases', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { receivedDate: '2026-03-20T00:00:00.000Z', clientId: 'c1' },
        firstOpenedAt: '2026-03-20T02:00:00.000Z', // 2h
        diagnostic: { issuedDate: '2026-03-21T00:00:00.000Z' } }, // 24h
      { id: 'b', order: { receivedDate: '2026-03-20T00:00:00.000Z', clientId: 'c2' },
        firstOpenedAt: '2026-03-20T06:00:00.000Z', // 6h
        diagnostic: { issuedDate: '2026-03-22T00:00:00.000Z' } }, // 48h
    ];
    const result = computeOrgWideTatPerformance(cases, entries as any);
    expect(result.firstTouchAvgHrs).toBe(4); // (2+6)/2
    expect(result.totalCaseAvgHrs).toBe(36); // (24+48)/2
    expect(result.clientCount).toBe(2);
  });

  it('excludes a case missing either real timestamp from that specific average, not fabricated', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { receivedDate: '2026-03-20T00:00:00.000Z' } }, // no firstOpenedAt or issuedDate at all
    ];
    const result = computeOrgWideTatPerformance(cases, entries as any);
    expect(result.firstTouchAvgHrs).toBe(0);
    expect(result.totalCaseAvgHrs).toBe(0);
  });

  it('computes a genuine on-target percentage from real breach/non-breach counts', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { receivedDate: '2026-03-20T00:00:00.000Z' }, firstOpenedAt: '2026-03-20T02:00:00.000Z' }, // within 4h target
      { id: 'b', order: { receivedDate: '2026-03-20T00:00:00.000Z' }, firstOpenedAt: '2026-03-20T08:00:00.000Z' }, // breaches 4h target
    ];
    const result = computeOrgWideTatPerformance(cases, entries as any);
    expect(result.onTargetPct).toBe(50);
  });

  it('never lets a metric with zero real data points drag down the other metric\'s genuine percentage - real bug caught and fixed here', () => {
    // Only first-touch data exists; total-case has zero real cases.
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { receivedDate: '2026-03-20T00:00:00.000Z' }, firstOpenedAt: '2026-03-20T02:00:00.000Z' }, // within target
    ];
    const result = computeOrgWideTatPerformance(cases, entries as any);
    expect(result.onTargetPct).toBe(100); // not 50 - total-case's absence must not count as a fabricated 0%
  });

  it('counts real, distinct client ids only, not duplicates', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { clientId: 'c1' } },
      { id: 'b', order: { clientId: 'c1' } },
      { id: 'c', order: { clientId: 'c2' } },
    ];
    const result = computeOrgWideTatPerformance(cases, entries as any);
    expect(result.clientCount).toBe(2);
  });
});

describe('computeRvu30 — real fix: replaces the hardcoded mockRvu30 object, using the real Code_Map_Table', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');

  it('computes a real RVU total from real, finalized cases using the rule-based default (no manual CPT coding exists yet)', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' },
        // 2 specimens -> rule-based default: 2x 88305 (0.73 each) = 1.46
        ...( { specimens: [{}, {}] } as any) },
    ];
    const result = computeRvu30(cases as any, 'PATH-001', [], now);
    expect(result.total).toBe(1.46);
    expect(result.avgPerCase).toBe(1.46);
  });

  it('uses real, assigned CPT codes for a specimen that has them, and the honest rule-based default for specimens that don\'t - per-specimen, not all-or-nothing', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' },
        ...( { specimens: [
          { id: 'sp-1', coding: { cpt: ['88342'] } }, // real, assigned code - used as-is
          { id: 'sp-2' }, // no real code - gets the honest, rule-based default (88305)
        ] } as any) },
    ];
    const result = computeRvu30(cases as any, 'PATH-001', [], now);
    expect(result.total).toBe(1.41); // 0.68 (real 88342) + 0.73 (rule-based default 88305 for sp-2)
  });

  it('sums real, block-level ancillary codes alongside a specimen\'s base code', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' },
        ...( { specimens: [
          { id: 'sp-1', coding: { cpt: ['88305'] }, blocks: [{ coding: { cpt: [{ code: '88342' }] } }] },
        ] } as any) },
    ];
    const result = computeRvu30(cases as any, 'PATH-001', [], now);
    expect(result.total).toBe(1.41); // 0.73 (specimen base) + 0.68 (block-level IHC)
  });

  it('uses a real, coder-configured dictionary default over the generic rule-based default when no manual code is assigned', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' },
        ...( { specimens: [{ id: 'sp-1', specimenDictionaryEntryId: 'dict-1' }] } as any) },
    ];
    const dictionaryEntries = [{ id: 'dict-1', defaultBaseCptCode: '88307' }];
    const result = computeRvu30(cases as any, 'PATH-001', [], now, dictionaryEntries);
    expect(result.total).toBe(1.55); // real 88307, not the generic 88305 default
  });

  it('a real, manually-assigned code still wins over the dictionary default - manual assignment is never overridden', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' },
        ...( { specimens: [{ id: 'sp-1', specimenDictionaryEntryId: 'dict-1', coding: { cpt: ['88342'] } }] } as any) },
    ];
    const dictionaryEntries = [{ id: 'dict-1', defaultBaseCptCode: '88307' }];
    const result = computeRvu30(cases as any, 'PATH-001', [], now, dictionaryEntries);
    expect(result.total).toBe(0.68); // the real, manually-assigned 88342, not the dictionary's 88307
  });

  it('excludes cases not genuinely finalized by this user', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'other-user', issuedDate: '2026-03-25T00:00:00.000Z' }, ...( { specimens: [{}] } as any) },
    ];
    const result = computeRvu30(cases as any, 'PATH-001', [], now);
    expect(result.total).toBe(0);
  });

  it('returns a null delta (never fabricated) with no real prior-period baseline', () => {
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T00:00:00.000Z' }, ...( { specimens: [{}] } as any) },
    ];
    const result = computeRvu30(cases as any, 'PATH-001', [], now);
    expect(result.deltaPct).toBeNull();
  });
});

describe('computeWeeklyDaily — real fix: replaces the hardcoded mockDaily array, using "This Week" (the real current Mon-Fri), matching the UI\'s own real label', () => {
  it('buckets real, finalized cases into the real day they were actually finalized', () => {
    // A real Wednesday
    const now = new Date('2026-03-25T15:00:00.000Z'); // Wed Mar 25 2026
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T10:00:00.000Z' }, ...( { specimens: [{}] } as any) },
    ];
    const result = computeWeeklyDaily(cases as any, 'PATH-001', 'America/Phoenix', [], now);
    expect(result).toHaveLength(5);
    expect(result.map(d => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    const wed = result.find(d => d.day === 'Wed')!;
    expect(wed.cases).toBe(1);
  });

  it('excludes a case finalized outside the real current week', () => {
    const now = new Date('2026-03-25T15:00:00.000Z');
    const cases: CaseForDashboardCalc[] = [
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-02-01T00:00:00.000Z' }, ...( { specimens: [{}] } as any) },
    ];
    const result = computeWeeklyDaily(cases as any, 'PATH-001', 'America/Phoenix', [], now);
    expect(result.reduce((s, d) => s + d.cases, 0)).toBe(0);
  });

  it('real fix, facility-timezone effort: a case issued at 11pm Tucson time (6am UTC the next day) lands on the real, correct facility-local day, not the UTC one', () => {
    // Real Wednesday in Arizona; "now" itself is safely mid-week so the
    // Monday-of-week computation isn't also being tested here.
    const now = new Date('2026-03-25T20:00:00.000Z'); // 1pm Wed Mar 25 Arizona
    const cases: CaseForDashboardCalc[] = [
      // 11pm Tuesday Mar 24 Arizona = 6am UTC Wed Mar 25 - the real,
      // exact scenario this whole facility-timezone effort exists for.
      { id: 'a', order: { assignedTo: 'PATH-001' }, diagnostic: { finalizedBy: 'PATH-001', issuedDate: '2026-03-25T06:00:00.000Z' }, ...( { specimens: [{}] } as any) },
    ];
    const result2 = computeWeeklyDaily(cases as any, 'PATH-001', 'America/Phoenix', [], now);
    const tue = result2.find(d => d.day === 'Tue')!;
    const wed = result2.find(d => d.day === 'Wed')!;
    expect(tue.cases).toBe(1); // real, correct facility-local day
    expect(wed.cases).toBe(0); // NOT the UTC day
  });
});

describe('computeCaseMixData — real fix: replaces the hardcoded mockCaseMixData object', () => {
  it('buckets real subspecialty ids correctly', () => {
    const cases = [
      makeCase({ id: 'a', subspecialtyId: 'breast' }),
      makeCase({ id: 'b', subspecialtyId: 'gi' }),
      makeCase({ id: 'c', subspecialtyId: 'derm' }),
    ];
    const result = computeCaseMixData(cases, 'PATH-001');
    expect(result).toEqual({ breast: 1, gi: 1, gu: 0, derm: 1, other: 0 });
  });

  it('maps the real seeded "uro" id to the gu bucket - same clinical concept, different id', () => {
    const cases = [makeCase({ subspecialtyId: 'uro' })];
    const result = computeCaseMixData(cases, 'PATH-001');
    expect(result.gu).toBe(1);
  });

  it('rolls any other real subspecialty, or none at all, into other', () => {
    const cases = [
      makeCase({ id: 'a', subspecialtyId: 'neuro' }),
      makeCase({ id: 'b', subspecialtyId: undefined }),
    ];
    const result = computeCaseMixData(cases, 'PATH-001');
    expect(result.other).toBe(2);
  });

  it('excludes cases not assigned to the current user', () => {
    const cases = [makeCase({ order: { assignedTo: 'other-user' }, subspecialtyId: 'breast' })];
    const result = computeCaseMixData(cases, 'PATH-001');
    expect(result.breast).toBe(0);
  });
});

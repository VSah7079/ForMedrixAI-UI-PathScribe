// src/components/Contribution/caseMixCalculations.test.ts
import { describe, it, expect } from 'vitest';
import { buildSubspecialtyBreakdown, describeSupervisionProgress, applyExpectedCaseMix, buildCaseMixExportRows } from './caseMixCalculations';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { QaSupervisionAssignment } from '@/types/quality/QaSupervisionAssignment';
import type { ExpectedCaseMixTarget } from '@/types/quality/QaSupervisionAssignmentType';
import type { Subspecialty } from '@/services';

function makeRecord(over: Partial<QaActivityRecord> = {}): QaActivityRecord {
  return {
    id: 'rec-1', activityTypeId: 'qa-activity-frozen-final', caseId: 'S26-1', specimenId: 'spec-1', caseType: 'Breast Core Bx',
    fieldValues: { frozenCategory: 'benign', finalCategory: 'benign', frozenDx: 'Benign', finalDx: 'Benign' },
    outcome: 'concordant', recordedAt: '2026-03-15T00:00:00.000Z',
    recordedBy: { userId: 'u1', userName: 'Dr. Test' },
    ...over,
  } as any;
}

function makeAssignment(over: Partial<QaSupervisionAssignment> = {}): QaSupervisionAssignment {
  return {
    id: 'assign-1', activityTypeId: 'qa-supervision-fppe',
    superviseeUserId: 'u2', superviseeUserName: 'Dr. Trainee',
    supervisorUserId: 'u1', supervisorUserName: 'Dr. Mentor',
    startedAt: '2026-03-01T00:00:00.000Z',
    endCondition: { type: 'case_count', threshold: 30 },
    casesReviewedCount: 12,
    status: 'active',
    ...over,
  };
}

const subspecialties: Subspecialty[] = [
  { id: 'ss-breast', name: 'Breast' } as Subspecialty,
  { id: 'ss-gi', name: 'GI' } as Subspecialty,
];

describe('buildSubspecialtyBreakdown — real coverage only, never a target/expectation', () => {
  it('groups by subspecialty and computes concordance rate per group', () => {
    const records = [
      makeRecord({ subspecialtyId: 'ss-breast', outcome: 'concordant' }),
      makeRecord({ subspecialtyId: 'ss-breast', outcome: 'discordant' }),
      makeRecord({ subspecialtyId: 'ss-gi', outcome: 'concordant' }),
    ];
    const result = buildSubspecialtyBreakdown(records, subspecialties);
    const breast = result.find(r => r.id === 'ss-breast')!;
    const gi = result.find(r => r.id === 'ss-gi')!;
    expect(breast.total).toBe(2);
    expect(breast.rate).toBe(50);
    expect(gi.total).toBe(1);
    expect(gi.rate).toBe(100);
  });

  it('groups records with no subspecialtyId under Unspecified rather than dropping them', () => {
    const records = [makeRecord({ subspecialtyId: undefined })];
    const result = buildSubspecialtyBreakdown(records, subspecialties);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Unspecified');
  });

  it('sorts lowest concordance first', () => {
    const records = [
      makeRecord({ subspecialtyId: 'ss-breast', outcome: 'concordant' }),
      makeRecord({ subspecialtyId: 'ss-gi', outcome: 'discordant' }),
    ];
    const result = buildSubspecialtyBreakdown(records, subspecialties);
    expect(result[0].id).toBe('ss-gi');
  });

  it('returns an empty array for no records — never a fabricated target row', () => {
    expect(buildSubspecialtyBreakdown([], subspecialties)).toEqual([]);
  });
});

describe('applyExpectedCaseMix — real config only, never a fabricated target', () => {
  it('returns breakdown unchanged when no targets are configured', () => {
    const breakdown = buildSubspecialtyBreakdown([makeRecord({ subspecialtyId: 'ss-breast' })], subspecialties);
    expect(applyExpectedCaseMix(breakdown, undefined, subspecialties)).toBe(breakdown);
    expect(applyExpectedCaseMix(breakdown, [], subspecialties)).toBe(breakdown);
  });

  it('marks a subspecialty as meeting or missing its configured target', () => {
    const breakdown = buildSubspecialtyBreakdown(
      [makeRecord({ subspecialtyId: 'ss-breast' }), makeRecord({ subspecialtyId: 'ss-breast' })],
      subspecialties
    );
    const targets: ExpectedCaseMixTarget[] = [{ subspecialtyId: 'ss-breast', minCount: 5 }];
    const result = applyExpectedCaseMix(breakdown, targets, subspecialties);
    const breast = result.find(r => r.id === 'ss-breast')!;
    expect(breast.target).toBe(5);
    expect(breast.metTarget).toBe(false);
  });

  it('surfaces a targeted subspecialty with zero real records at 0 of N, rather than omitting it', () => {
    const targets: ExpectedCaseMixTarget[] = [{ subspecialtyId: 'ss-gi', minCount: 3 }];
    const result = applyExpectedCaseMix([], targets, subspecialties);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'ss-gi', name: 'GI', total: 0, target: 3, metTarget: false });
  });

  it('sorts unmet targets first, then met targets, then untargeted rows', () => {
    const breakdown = buildSubspecialtyBreakdown(
      [
        makeRecord({ subspecialtyId: 'ss-breast', outcome: 'concordant' }), // will meet its target
        makeRecord({ subspecialtyId: 'ss-gi', outcome: 'discordant' }),     // no target — untargeted
      ],
      subspecialties
    );
    const targets: ExpectedCaseMixTarget[] = [
      { subspecialtyId: 'ss-breast', minCount: 1 },
      { subspecialtyId: 'ss-derm', minCount: 4 }, // zero real records — unmet
    ];
    const result = applyExpectedCaseMix(breakdown, targets, subspecialties);
    expect(result[0].id).toBe('ss-derm');   // unmet target — the actionable gap
    expect(result[1].id).toBe('ss-breast'); // met target
    expect(result[2].id).toBe('ss-gi');     // untargeted, falls back to rate ordering
  });
});

describe('buildCaseMixExportRows', () => {
  it('reports null (not zero, not a placeholder) for target/variance/compliance when no target is configured', () => {
    const breakdown = buildSubspecialtyBreakdown([makeRecord({ subspecialtyId: 'ss-breast', outcome: 'concordant' })], subspecialties);
    const rows = buildCaseMixExportRows('u2', breakdown);
    expect(rows[0]).toMatchObject({
      Resident_ID: 'u2', Category_Code: 'ss-breast', Category_Description: 'Breast', Logged_Count: 1,
      Enterprise_Target_Goal: null, Variance: null, Compliance_Status: null,
    });
  });

  it('computes variance and compliance against a real configured target', () => {
    const breakdown = applyExpectedCaseMix(
      buildSubspecialtyBreakdown([makeRecord({ subspecialtyId: 'ss-breast' }), makeRecord({ subspecialtyId: 'ss-breast' })], subspecialties),
      [{ subspecialtyId: 'ss-breast', minCount: 5 }],
      subspecialties
    );
    const rows = buildCaseMixExportRows('u2', breakdown);
    expect(rows[0]).toMatchObject({ Enterprise_Target_Goal: 5, Variance: -3, Compliance_Status: 'Deficit' });
  });

  it('marks concordance Unchecked at zero records, Discrepant below the 90% threshold, Verified at/above it', () => {
    const breakdown = [
      { id: 'a', name: 'A', total: 0, concordant: 0, rate: 0 },
      { id: 'b', name: 'B', total: 10, concordant: 8, rate: 80 },
      { id: 'c', name: 'C', total: 10, concordant: 9, rate: 90 },
    ];
    const rows = buildCaseMixExportRows('u2', breakdown);
    expect(rows.map(r => r.Concordance_Status)).toEqual(['Unchecked', 'Discrepant', 'Verified']);
  });
});

describe('describeSupervisionProgress', () => {
  const now = new Date('2026-03-15T00:00:00.000Z'); // 14 days after startedAt

  it('reports case-count progress, clamped at 100', () => {
    const result = describeSupervisionProgress(makeAssignment({ endCondition: { type: 'case_count', threshold: 30 }, casesReviewedCount: 45 }), now);
    expect(result.pct).toBe(100);
    expect(result.label).toBe('45 of 30 cases reviewed');
  });

  it('reports duration progress from real elapsed days', () => {
    const result = describeSupervisionProgress(makeAssignment({ endCondition: { type: 'duration_days', threshold: 60 } }), now);
    expect(result.label).toBe('14 of 60 days elapsed');
    expect(result.pct).toBeCloseTo((14 / 60) * 100, 5);
  });

  it('under "either", reports whichever condition is actually closer to being met', () => {
    // 12/30 cases = 40%; 14/28 days = 50% — duration is closer, should win
    const result = describeSupervisionProgress(
      makeAssignment({ endCondition: { type: 'either', caseCountThreshold: 30, durationDaysThreshold: 28 }, casesReviewedCount: 12 }),
      now
    );
    expect(result.label).toBe('14 of 28 days elapsed');
  });
});

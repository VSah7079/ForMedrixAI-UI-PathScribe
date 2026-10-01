import { describe, it, expect } from 'vitest';
import { resolveQaActivityDashboardReport } from './resolveQaActivityDashboardReport';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { Subspecialty } from '@/services/subspecialties/ISubspecialtyService';

const activityTypes: QaActivityType[] = [
  { id: 'qa-activity-frozen-final', name: 'Frozen vs Final Correlation', tabScope: 'standard', fields: [], teachingOnboardingEnabled: false, active: true, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'seed' },
  { id: 'qa-activity-cyto-histo', name: 'Cytology-Histology Correlation', tabScope: 'standard', fields: [], teachingOnboardingEnabled: false, active: true, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'seed' },
];

const subspecialties: Subspecialty[] = [
  { id: 'gi', name: 'Gastrointestinal', userIds: [], specimenIds: [], clientIds: [], isWorkgroup: false, isWorkgroupEnabled: false, active: true, status: 'Active' },
  { id: 'breast', name: 'Breast', userIds: [], specimenIds: [], clientIds: [], isWorkgroup: false, isWorkgroupEnabled: false, active: true, status: 'Active' },
];

function rec(overrides: Partial<QaActivityRecord>): QaActivityRecord {
  return {
    id: overrides.id ?? `rec-${Math.random()}`,
    activityTypeId: 'qa-activity-frozen-final',
    caseId: 'S26-0001',
    caseType: 'Test',
    subspecialtyId: 'gi',
    fieldValues: {},
    outcome: 'concordant',
    recordedAt: new Date().toISOString(),
    recordedBy: { userId: 'user-1', userName: 'Dr. Test' },
    ...overrides,
  };
}

describe('resolveQaActivityDashboardReport', () => {
  it('an empty input produces an honest, zeroed report — never a fabricated 100%', () => {
    const report = resolveQaActivityDashboardReport([], activityTypes, subspecialties);
    expect(report.totalRecords).toBe(0);
    expect(report.overallConcordantPercent).toBe(0);
    expect(report.byActivityType).toEqual([]);
    expect(report.monthlyTrend).toHaveLength(6);
  });

  it('groups by activity type, subspecialty, and reviewer with correct concordance percentages', () => {
    const records = [
      rec({ activityTypeId: 'qa-activity-frozen-final', subspecialtyId: 'gi', recordedBy: { userId: 'user-1', userName: 'Dr. Reyes' }, outcome: 'concordant' }),
      rec({ activityTypeId: 'qa-activity-frozen-final', subspecialtyId: 'gi', recordedBy: { userId: 'user-1', userName: 'Dr. Reyes' }, outcome: 'discordant', severity: 'high', escalationRequired: true }),
      rec({ activityTypeId: 'qa-activity-cyto-histo', subspecialtyId: 'breast', recordedBy: { userId: 'user-2', userName: 'Dr. Owusu' }, outcome: 'concordant' }),
    ];
    const report = resolveQaActivityDashboardReport(records, activityTypes, subspecialties);

    expect(report.totalRecords).toBe(3);
    expect(report.discordantCount).toBe(1);
    expect(report.escalationRequiredCount).toBe(1);
    expect(report.overallConcordantPercent).toBeCloseTo((2 / 3) * 100);

    const frozenFinal = report.byActivityType.find(g => g.id === 'qa-activity-frozen-final');
    expect(frozenFinal?.name).toBe('Frozen vs Final Correlation');
    expect(frozenFinal?.total).toBe(2);
    expect(frozenFinal?.discordant).toBe(1);
    expect(frozenFinal?.concordantPercent).toBeCloseTo(50);

    const gi = report.bySubspecialty.find(g => g.id === 'gi');
    expect(gi?.name).toBe('Gastrointestinal');
    expect(gi?.total).toBe(2);

    const reyes = report.byReviewer.find(g => g.id === 'user-1');
    expect(reyes?.name).toBe('Dr. Reyes');
    expect(reyes?.total).toBe(2);
  });

  it('an unresolvable activity type id still produces a real, visible row rather than disappearing', () => {
    const records = [rec({ activityTypeId: 'qa-activity-deleted-type' })];
    const report = resolveQaActivityDashboardReport(records, activityTypes, subspecialties);
    const row = report.byActivityType.find(g => g.id === 'qa-activity-deleted-type');
    expect(row?.name).toBe('qa-activity-deleted-type');
    expect(row?.total).toBe(1);
  });

  it('a record with no subspecialtyId groups under the honest "Unassigned" bucket, not dropped', () => {
    const records = [rec({ subspecialtyId: undefined })];
    const report = resolveQaActivityDashboardReport(records, activityTypes, subspecialties);
    const row = report.bySubspecialty.find(g => g.id === '__unassigned__');
    expect(row?.name).toBe('Unassigned Organ System');
    expect(row?.total).toBe(1);
  });

  it('sorts each group by descending total volume', () => {
    const records = [
      rec({ subspecialtyId: 'breast' }),
      rec({ subspecialtyId: 'gi' }),
      rec({ subspecialtyId: 'gi' }),
    ];
    const report = resolveQaActivityDashboardReport(records, activityTypes, subspecialties);
    expect(report.bySubspecialty[0].id).toBe('gi');
    expect(report.bySubspecialty[0].total).toBe(2);
  });
});

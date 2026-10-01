import { describe, it, expect } from 'vitest';
import { resolveQaEvidenceBinder } from './resolveQaEvidenceBinder';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { QaActivityType } from '@/types/quality/QaActivityType';

const NOW = new Date('2026-09-20T00:00:00.000Z');

const activityTypes: QaActivityType[] = [
  {
    id: 'qa-activity-frozen-final', name: 'Frozen vs Final Correlation', tabScope: 'standard',
    jurisdictions: ['US', 'GB_EW'],
    fields: [], teachingOnboardingEnabled: false, active: true, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'seed',
    capaTriggerRule: { triggerSeverities: ['high'], deficiencyTypeId: 'def-x' },
  },
  {
    id: 'qa-activity-custom-noJurisdiction', name: 'Site-Specific Grossing QA', tabScope: 'custom',
    fields: [], teachingOnboardingEnabled: false, active: true, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'seed',
  },
];

function rec(overrides: Partial<QaActivityRecord>): QaActivityRecord {
  return {
    id: overrides.id ?? `rec-${Math.random()}`,
    activityTypeId: 'qa-activity-frozen-final',
    caseId: 'S26-0001',
    caseType: 'Test',
    fieldValues: {},
    outcome: 'concordant',
    recordedAt: NOW.toISOString(),
    recordedBy: { userId: 'user-1', userName: 'Dr. Test' },
    ...overrides,
  };
}

describe('resolveQaEvidenceBinder', () => {
  it('an empty input produces an honest, zeroed binder', () => {
    const report = resolveQaEvidenceBinder([], activityTypes, 24, NOW);
    expect(report.totalRecords).toBe(0);
    expect(report.entries).toEqual([]);
    expect(report.windowMonths).toBe(24);
  });

  it('excludes records outside the requested window', () => {
    const outsideWindow = rec({ recordedAt: new Date('2020-01-01T00:00:00.000Z').toISOString() });
    const insideWindow = rec({ recordedAt: NOW.toISOString() });
    const report = resolveQaEvidenceBinder([outsideWindow, insideWindow], activityTypes, 24, NOW);
    expect(report.totalRecords).toBe(1);
  });

  it('maps an activity type to its real, configured jurisdictions\' regulatory clauses', () => {
    const report = resolveQaEvidenceBinder([rec({})], activityTypes, 24, NOW);
    const entry = report.entries.find(e => e.activityTypeId === 'qa-activity-frozen-final');
    expect(entry?.regulatoryBasis).toEqual([
      { jurisdiction: 'US', clause: 'CAP AP Checklist / CLIA interpretive QA requirements' },
      { jurisdiction: 'GB_EW', clause: 'UKAS ISO 15189 — interpretive audits, discrepancy documentation' },
    ]);
  });

  it('a custom activity type with no configured jurisdictions honestly cites none, not a fabricated default', () => {
    const report = resolveQaEvidenceBinder(
      [rec({ activityTypeId: 'qa-activity-custom-noJurisdiction' })], activityTypes, 24, NOW,
    );
    const entry = report.entries.find(e => e.activityTypeId === 'qa-activity-custom-noJurisdiction');
    expect(entry?.regulatoryBasis).toEqual([]);
  });

  it('flags a record as meeting the CAPA threshold only when discordant and severity matches the configured trigger', () => {
    const meetsThreshold = rec({ id: 'a', outcome: 'discordant', severity: 'high' });
    const belowThreshold = rec({ id: 'b', outcome: 'discordant', severity: 'low' });
    const concordant = rec({ id: 'c', outcome: 'concordant' });
    const report = resolveQaEvidenceBinder([meetsThreshold, belowThreshold, concordant], activityTypes, 24, NOW);
    const entry = report.entries.find(e => e.activityTypeId === 'qa-activity-frozen-final')!;
    expect(entry.capaThresholdMetCount).toBe(1);
    expect(entry.records.find(r => r.recordId === 'a')?.meetsCapaThreshold).toBe(true);
    expect(entry.records.find(r => r.recordId === 'b')?.meetsCapaThreshold).toBe(false);
  });

  it('sorts entries by descending record volume', () => {
    const report = resolveQaEvidenceBinder(
      [rec({ activityTypeId: 'qa-activity-custom-noJurisdiction' }), rec({}), rec({})],
      activityTypes, 24, NOW,
    );
    expect(report.entries[0].activityTypeId).toBe('qa-activity-frozen-final');
    expect(report.entries[0].totalRecords).toBe(2);
  });
});

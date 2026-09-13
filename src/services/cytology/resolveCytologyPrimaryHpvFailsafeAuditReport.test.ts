// src/services/cytology/resolveCytologyPrimaryHpvFailsafeAuditReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyPrimaryHpvFailsafeAuditReport } from './resolveCytologyPrimaryHpvFailsafeAuditReport';

describe('resolveCytologyPrimaryHpvFailsafeAuditReport — real, per direct guidance\'s own UK-QA-01 specification', () => {
  it('a genuinely empty input produces zero rows, never a crash', () => {
    expect(resolveCytologyPrimaryHpvFailsafeAuditReport([])).toHaveLength(0);
  });

  it('real specimens correctly group by real jurisdiction, never mixing two different real jurisdictions into one row', () => {
    const rows = resolveCytologyPrimaryHpvFailsafeAuditReport([
      { jurisdiction: 'GB_EW', hpvPositive: true, cytologyTriagePerformed: true, cytologyTriageInadequate: false },
      { jurisdiction: 'GB_SCT', hpvPositive: true, cytologyTriagePerformed: true, cytologyTriageInadequate: false },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.jurisdiction).sort()).toEqual(['GB_EW', 'GB_SCT']);
  });

  it('real HPV-positive counts and real triage-performed counts are correctly, independently tallied', () => {
    const [row] = resolveCytologyPrimaryHpvFailsafeAuditReport([
      { jurisdiction: 'GB_EW', hpvPositive: true, cytologyTriagePerformed: true, cytologyTriageInadequate: false },
      { jurisdiction: 'GB_EW', hpvPositive: true, cytologyTriagePerformed: false, cytologyTriageInadequate: false },
      { jurisdiction: 'GB_EW', hpvPositive: false, cytologyTriagePerformed: false, cytologyTriageInadequate: false },
    ]);
    expect(row.totalHpvPrimaryPositives).toBe(2);
    expect(row.cytologyTriagePerformedCount).toBe(1);
  });

  it('the real inadequate cytology rate is computed only among real, actually-triaged specimens, not the whole jurisdiction', () => {
    const [row] = resolveCytologyPrimaryHpvFailsafeAuditReport([
      { jurisdiction: 'GB_EW', hpvPositive: true, cytologyTriagePerformed: true, cytologyTriageInadequate: true },
      { jurisdiction: 'GB_EW', hpvPositive: true, cytologyTriagePerformed: true, cytologyTriageInadequate: false },
      { jurisdiction: 'GB_EW', hpvPositive: true, cytologyTriagePerformed: false, cytologyTriageInadequate: false },
    ]);
    expect(row.inadequateCytologyRatePercent).toBe(50);
  });

  it('a real jurisdiction with zero real triage performed gets an honest 0% rate, never NaN', () => {
    const [row] = resolveCytologyPrimaryHpvFailsafeAuditReport([
      { jurisdiction: 'GB_NIR', hpvPositive: false, cytologyTriagePerformed: false, cytologyTriageInadequate: false },
    ]);
    expect(row.inadequateCytologyRatePercent).toBe(0);
  });

  it('the real, honest failsafe columns are always undefined, never a fabricated value — no tracking mechanism exists for them', () => {
    const [row] = resolveCytologyPrimaryHpvFailsafeAuditReport([
      { jurisdiction: 'GB_EW', hpvPositive: true, cytologyTriagePerformed: true, cytologyTriageInadequate: false },
    ]);
    expect(row.failsafeDirectColposcopyReferrals).toBeUndefined();
    expect(row.nonRespondedFailsafeAlerts).toBeUndefined();
  });
});

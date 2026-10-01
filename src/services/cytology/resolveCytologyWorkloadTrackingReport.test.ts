// src/services/cytology/resolveCytologyWorkloadTrackingReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyWorkloadTrackingReport } from './resolveCytologyWorkloadTrackingReport';
import type { CytologyWorkloadLedgerEntry } from '@/types/cytology/CytologyWorkloadLedgerEntry';

let seq = 0;
const entry = (userId: string, day: string, reviewMode: CytologyWorkloadLedgerEntry['reviewMode'], scuWeight: number, activeDurationSeconds: number): CytologyWorkloadLedgerEntry => {
  seq++;
  return { id: 'l' + seq, userId, caseId: 'C' + seq, specimenId: 'SP' + seq, reviewRecordId: 'R' + seq, reviewMode, scuWeight, activeDurationSeconds, completedAt: `${day}T10:00:00.000Z` };
};

describe('resolveCytologyWorkloadTrackingReport — real, per direct guidance\'s CYT-QA-05 specification', () => {
  it('groups real ledger entries by real user and real calendar shift day, never mixing two different days together', () => {
    const entries = [
      entry('ct1', '2026-09-01', 'primary_manual', 1.0, 3600),
      entry('ct1', '2026-09-02', 'primary_manual', 1.0, 3600),
    ];
    const rows = resolveCytologyWorkloadTrackingReport(entries, {}, 100);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.shiftDate).sort()).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('correctly splits real Manual vs. Imager slide counts — only fov_assisted counts as Imager', () => {
    const entries = [
      entry('ct1', '2026-09-01', 'primary_manual', 1.0, 3600),
      entry('ct1', '2026-09-01', 'fov_assisted', 0.5, 3600),
      entry('ct1', '2026-09-01', 'fov_manual_rescreen', 1.5, 3600),
    ];
    const [row] = resolveCytologyWorkloadTrackingReport(entries, {}, 100);
    expect(row.imagerSlidesCount).toBe(1);
    expect(row.manualSlidesCount).toBe(2);
    expect(row.totalEquivSlides).toBeCloseTo(3.0, 5);
  });

  it('real, per-user effective cap overrides the given default cap, matching this module\'s own established 3-tier cascade result', () => {
    const entries = [entry('ct1', '2026-09-01', 'primary_manual', 90, 8 * 3600)];
    const rowsWithOverride = resolveCytologyWorkloadTrackingReport(entries, { ct1: 80 }, 100);
    expect(rowsWithOverride[0].maxAllowedVolume).toBe(80);
    const rowsWithDefault = resolveCytologyWorkloadTrackingReport(entries, {}, 100);
    expect(rowsWithDefault[0].maxAllowedVolume).toBe(100);
  });

  it('a real, genuine exceedance is correctly flagged, reusing the same real capacity formula the live sign-out gate already enforces', () => {
    const entries = [entry('ct1', '2026-09-01', 'primary_manual', 110, 8 * 3600)];
    const [row] = resolveCytologyWorkloadTrackingReport(entries, {}, 100);
    expect(row.exceedanceFlag).toBe(true);
  });

  it('real usage landing exactly on the cap is not flagged — the same real, strict greater-than boundary already established', () => {
    const entries = [entry('ct1', '2026-09-01', 'primary_manual', 100, 8 * 3600)];
    const [row] = resolveCytologyWorkloadTrackingReport(entries, {}, 100);
    expect(row.exceedanceFlag).toBe(false);
  });

  it('real active duration correctly sums into hours, not left in raw seconds', () => {
    const entries = [entry('ct1', '2026-09-01', 'primary_manual', 1.0, 3600), entry('ct1', '2026-09-01', 'primary_manual', 1.0, 1800)];
    const [row] = resolveCytologyWorkloadTrackingReport(entries, {}, 100);
    expect(row.hoursScreened).toBeCloseTo(1.5, 5);
  });
});

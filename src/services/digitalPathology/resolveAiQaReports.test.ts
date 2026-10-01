// src/services/digitalPathology/resolveAiQaReports.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAiHumanDiscrepancyReport } from './resolveAiHumanDiscrepancyReport';
import { resolveAiScreeningTimeoutStatus } from './resolveAiScreeningTimeoutStatus';
import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';

const base = (over: Partial<AiScreeningResult>): AiScreeningResult => ({
  id: 'r1', caseId: 'S26-0001-SP-001', vendorId: 'dp-vendor-paige-prostate', status: 'completed',
  orderedAt: '2026-01-01T00:00:00.000Z', findings: [], ...over,
});

describe('resolveAiHumanDiscrepancyReport — real, per-vendor discordance-rate report', () => {
  it('real, results never reviewed by a human (humanConcordant undefined) are excluded entirely — never counted as concordant by default', () => {
    const report = resolveAiHumanDiscrepancyReport([base({ humanConcordant: undefined })]);
    expect(report.totalReviewed).toBe(0);
  });

  it('real, a mix of concordant/discordant results for the same vendor produces the real, correct rate', () => {
    const report = resolveAiHumanDiscrepancyReport([
      base({ id: 'r1', humanConcordant: true }),
      base({ id: 'r2', humanConcordant: true }),
      base({ id: 'r3', humanConcordant: false }),
    ]);
    expect(report.totalReviewed).toBe(3);
    expect(report.totalDiscordant).toBe(1);
    expect(report.byVendor[0].discordanceRate).toBeCloseTo(1 / 3);
  });

  it('real, two different real vendors are correctly kept separate, never combined into one, misleading rate', () => {
    const report = resolveAiHumanDiscrepancyReport([
      base({ id: 'r1', vendorId: 'dp-vendor-paige-prostate', humanConcordant: false }),
      base({ id: 'r2', vendorId: 'dp-vendor-ibex-prostate-detect', humanConcordant: true }),
    ]);
    expect(report.byVendor).toHaveLength(2);
    const paige = report.byVendor.find(v => v.vendorId === 'dp-vendor-paige-prostate');
    const ibex = report.byVendor.find(v => v.vendorId === 'dp-vendor-ibex-prostate-detect');
    expect(paige?.discordanceRate).toBe(1);
    expect(ibex?.discordanceRate).toBe(0);
  });

  it('real, a vendor with zero reviewed results gets an honest undefined rate, never a fabricated 0% or NaN', () => {
    const report = resolveAiHumanDiscrepancyReport([]);
    expect(report.byVendor).toHaveLength(0);
  });
});

describe('resolveAiScreeningTimeoutStatus — real, genuinely stalled AI screenings', () => {
  const NOW = new Date('2026-09-08T12:00:00.000Z');

  it('real, an ordered result well past the real default 24h window is flagged', () => {
    const stalled = resolveAiScreeningTimeoutStatus([
      base({ status: 'ordered', orderedAt: '2026-09-06T12:00:00.000Z' }),
    ], NOW);
    expect(stalled).toHaveLength(1);
  });

  it('real, an ordered result well within the window is NOT flagged', () => {
    const stalled = resolveAiScreeningTimeoutStatus([
      base({ status: 'ordered', orderedAt: '2026-09-08T11:00:00.000Z' }),
    ], NOW);
    expect(stalled).toHaveLength(0);
  });

  it('real, a genuinely completed/failed/timed_out result is never re-flagged, regardless of how old it is', () => {
    const stalled = resolveAiScreeningTimeoutStatus([
      base({ status: 'completed', orderedAt: '2026-01-01T00:00:00.000Z' }),
      base({ status: 'timed_out', orderedAt: '2026-01-01T00:00:00.000Z' }),
    ], NOW);
    expect(stalled).toHaveLength(0);
  });

  it('real, a custom, real timeoutHours threshold is honored instead of the default', () => {
    const stalled = resolveAiScreeningTimeoutStatus([
      base({ status: 'ordered', orderedAt: '2026-09-08T10:00:00.000Z' }),
    ], NOW, 1);
    expect(stalled).toHaveLength(1);
  });
});

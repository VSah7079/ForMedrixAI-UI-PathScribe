// src/services/cytology/resolveCytologyMolecularQcFailureRateReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyMolecularQcFailureRateReport } from './resolveCytologyMolecularQcFailureRateReport';
import type { MolecularQcRunRecord } from './IMolecularQcRunRecordService';

const run = (overrides: Partial<MolecularQcRunRecord>): MolecularQcRunRecord => ({
  id: 'r1', runDate: '2026-01-01T00:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Test Assay',
  reagentLotNumber: 'LOT-1', totalSamplesRun: 100, invalidControlCount: 0, inhibitorCount: 0, controlResults: [],
  ...overrides,
});

describe('resolveCytologyMolecularQcFailureRateReport — real, per direct guidance\'s own MOL-QA-02 specification', () => {
  it('a genuinely empty input produces zero rows, never a crash', () => {
    expect(resolveCytologyMolecularQcFailureRateReport([])).toHaveLength(0);
  });

  it('the real overall failure rate correctly combines both invalid and inhibitor counts', () => {
    const [row] = resolveCytologyMolecularQcFailureRateReport([run({ totalSamplesRun: 100, invalidControlCount: 2, inhibitorCount: 3 })]);
    expect(row.overallFailureRatePercent).toBe(5);
  });

  it('a real run at or under the real default 5% threshold does not flag as exceeded', () => {
    const [row] = resolveCytologyMolecularQcFailureRateReport([run({ totalSamplesRun: 100, invalidControlCount: 5, inhibitorCount: 0 })]);
    expect(row.thresholdExceeded).toBe(false);
  });

  it('a real run genuinely over the real default 5% threshold correctly flags as exceeded', () => {
    const [row] = resolveCytologyMolecularQcFailureRateReport([run({ totalSamplesRun: 100, invalidControlCount: 6, inhibitorCount: 0 })]);
    expect(row.thresholdExceeded).toBe(true);
  });

  it('a real, custom threshold is honored when explicitly provided', () => {
    const [row] = resolveCytologyMolecularQcFailureRateReport([run({ totalSamplesRun: 100, invalidControlCount: 2, inhibitorCount: 0 })], 1);
    expect(row.thresholdExceeded).toBe(true);
  });

  it('a real run with zero real samples never divides by zero — an honest 0%, never NaN', () => {
    const [row] = resolveCytologyMolecularQcFailureRateReport([run({ totalSamplesRun: 0, invalidControlCount: 0, inhibitorCount: 0 })]);
    expect(row.overallFailureRatePercent).toBe(0);
    expect(Number.isNaN(row.overallFailureRatePercent)).toBe(false);
  });

  it('real, multiple runs each resolve their own independent real row, one per run — no aggregation', () => {
    const rows = resolveCytologyMolecularQcFailureRateReport([run({ id: 'r1' }), run({ id: 'r2' })]);
    expect(rows).toHaveLength(2);
  });
});

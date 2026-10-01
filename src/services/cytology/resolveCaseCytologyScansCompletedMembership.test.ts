// src/services/cytology/resolveCaseCytologyScansCompletedMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCaseCytologyScansCompletedMembership } from './resolveCaseCytologyScansCompletedMembership';
import type { WsiScanBatch } from '../digitalPathology/IWsiScanBatchService';

function makeBatch(overrides: Partial<WsiScanBatch> = {}): WsiScanBatch {
  return {
    id: 'b1', batchBarcode: 'WSI-20260908-0001', scannerInstrumentId: 'WSI-01', status: 'scanning',
    slides: [{ slidePosition: '1', caseId: 'c1', specimenId: 's1', scanStatus: 'completed' }],
    loadedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

const SPECIMENS = [{ id: 's1', cytologyScreening: {} }];

describe('resolveCaseCytologyScansCompletedMembership — real, per direct follow-up on Cytology Assisted Instrumentation', () => {
  it('real, direct correction verified: a real, traditional_guided lab never shows anything in this tile, even with a real, completed scan on file', () => {
    const result = resolveCaseCytologyScansCompletedMembership('c1', SPECIMENS, [makeBatch()], 'traditional_guided');
    expect(result).toBe(false);
  });

  it('real, a genuine, completed WSI scan for this case correctly qualifies', () => {
    const result = resolveCaseCytologyScansCompletedMembership('c1', SPECIMENS, [makeBatch()], 'wsi');
    expect(result).toBe(true);
  });

  it('real, a real slide still "scanning" (not yet completed) correctly does not qualify', () => {
    const batch = makeBatch({ slides: [{ slidePosition: '1', caseId: 'c1', specimenId: 's1', scanStatus: 'scanning' }] });
    const result = resolveCaseCytologyScansCompletedMembership('c1', SPECIMENS, [batch], 'wsi');
    expect(result).toBe(false);
  });

  it('real, a case already screened (a real, recorded finalDiagnosis exists) correctly no longer qualifies, even with a completed scan', () => {
    const screenedSpecimens = [{ id: 's1', cytologyScreening: { finalDiagnosis: { reviewRecordId: 'r1' } } }];
    const result = resolveCaseCytologyScansCompletedMembership('c1', screenedSpecimens, [makeBatch()], 'wsi');
    expect(result).toBe(false);
  });

  it('real, a genuinely unrelated case\'s own completed scan never qualifies a different case', () => {
    const result = resolveCaseCytologyScansCompletedMembership('c2', SPECIMENS, [makeBatch()], 'wsi');
    expect(result).toBe(false);
  });

  it('real, a genuinely empty specimen list correctly never qualifies', () => {
    const result = resolveCaseCytologyScansCompletedMembership('c1', [], [makeBatch()], 'wsi');
    expect(result).toBe(false);
  });
});

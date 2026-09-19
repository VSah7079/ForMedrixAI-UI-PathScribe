import { describe, it, expect } from 'vitest';
import { resolveDigitalPriorCounts } from './resolveDigitalPriorCounts';
import type { WsiScanBatch } from './IWsiScanBatchService';

const batch = (overrides: Partial<WsiScanBatch>): WsiScanBatch => ({
  id: 'b1', batchBarcode: 'WSI-1', scannerInstrumentId: 'inst-1', status: 'completed',
  loadedAt: '2026-01-01T00:00:00.000Z', slides: [], ...overrides,
});

describe('resolveDigitalPriorCounts', () => {
  it('a real prior case with a real, completed WSI slide counts as a digital prior', () => {
    const batches = [batch({ slides: [{ slidePosition: '1', caseId: 'case-A', specimenId: 's1', scanStatus: 'completed' }] })];
    const result = resolveDigitalPriorCounts(['case-A'], batches);
    expect(result).toEqual({ digitalPriorCount: 1, glassPriorCount: 0 });
  });

  it('a real prior case with no real WSI data at all counts as a glass prior', () => {
    const result = resolveDigitalPriorCounts(['case-B'], []);
    expect(result).toEqual({ digitalPriorCount: 0, glassPriorCount: 1 });
  });

  it('a real prior case whose own real scan is still pending/failed \u2014 not yet genuinely available for digital review \u2014 counts as glass, not digital', () => {
    const batches = [batch({ slides: [{ slidePosition: '1', caseId: 'case-C', specimenId: 's1', scanStatus: 'failed', failureReason: 'Focus error' }] })];
    const result = resolveDigitalPriorCounts(['case-C'], batches);
    expect(result).toEqual({ digitalPriorCount: 0, glassPriorCount: 1 });
  });

  it('a real mix of digital and glass priors across several real cases is counted correctly, and a case with multiple completed slides is never double-counted', () => {
    const batches = [
      batch({ id: 'b1', slides: [
        { slidePosition: '1', caseId: 'case-D', specimenId: 's1', scanStatus: 'completed' },
        { slidePosition: '2', caseId: 'case-D', specimenId: 's2', scanStatus: 'completed' },
      ] }),
      batch({ id: 'b2', slides: [{ slidePosition: '1', caseId: 'case-E', specimenId: 's1', scanStatus: 'completed' }] }),
    ];
    const result = resolveDigitalPriorCounts(['case-D', 'case-E', 'case-F'], batches);
    expect(result).toEqual({ digitalPriorCount: 2, glassPriorCount: 1 });
  });

  it('a real, genuinely empty prior case list returns zero for both, never a fabricated count', () => {
    expect(resolveDigitalPriorCounts([], [])).toEqual({ digitalPriorCount: 0, glassPriorCount: 0 });
  });
});

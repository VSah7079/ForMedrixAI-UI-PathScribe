// src/services/printing/runScheduledBatchAggregation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mockPrintQueueService', () => ({
  mockPrintQueueService: { getAll: vi.fn(), tagBatch: vi.fn() },
}));

import { mockPrintQueueService } from './mockPrintQueueService';
import { runScheduledBatchAggregation } from './runScheduledBatchAggregation';
import type { PrintJob } from '@/types/printing/PrintJob';

function makeJob(overrides: Partial<PrintJob> & Pick<PrintJob, 'id'>): PrintJob {
  return {
    caseId: 'CASE-1', reportType: 'FINAL', mode: 'NATIVE_QZ_TRAY', priority: 'Routine',
    status: 'QUEUED', queuedAt: '2026-09-23T10:00:00.000Z', retryCount: 0, maxRetriesExceeded: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(mockPrintQueueService.getAll).mockReset();
  vi.mocked(mockPrintQueueService.tagBatch).mockReset().mockImplementation(async (ids: string[]) => ({ ok: true, data: { succeededIds: ids, failed: [] } } as any));
});

describe('runScheduledBatchAggregation — real, on-demand orchestration per PS-279 §2.2.2', () => {
  it('fetches only real QUEUED jobs, aggregates them, and tags each real group with its real batchId', async () => {
    vi.mocked(mockPrintQueueService.getAll).mockResolvedValue({
      ok: true,
      data: [
        makeJob({ id: 'j1', orderingFacilityId: 'CLIENT-A' }),
        makeJob({ id: 'j2', orderingFacilityId: 'CLIENT-A' }),
        makeJob({ id: 'j3', orderingFacilityId: 'CLIENT-B' }),
        makeJob({ id: 'j4', orderingFacilityId: 'CLIENT-A', status: 'PRINTED' }),
      ],
    } as any);

    const result = await runScheduledBatchAggregation({ groupBy: 'clientAccount', windowStart: '00:00', windowEnd: '23:59' }, 'seed1');

    expect(result.groups).toHaveLength(2);
    expect(mockPrintQueueService.tagBatch).toHaveBeenCalledTimes(2);
    expect(mockPrintQueueService.tagBatch).toHaveBeenCalledWith(['j1', 'j2'], 'batch-clientAccount-CLIENT-A-seed1');
    expect(mockPrintQueueService.tagBatch).toHaveBeenCalledWith(['j3'], 'batch-clientAccount-CLIENT-B-seed1');
    expect(result.taggedJobCount).toBe(3);
  });

  it('a real, honest taggedJobCount reflects any real, partial tagBatch failure rather than assuming full success', async () => {
    vi.mocked(mockPrintQueueService.getAll).mockResolvedValue({
      ok: true, data: [makeJob({ id: 'j1', orderingFacilityId: 'CLIENT-A' }), makeJob({ id: 'j2', orderingFacilityId: 'CLIENT-A' })],
    } as any);
    vi.mocked(mockPrintQueueService.tagBatch).mockResolvedValue({ ok: true, data: { succeededIds: ['j1'], failed: [{ id: 'j2', error: 'not found' }] } } as any);

    const result = await runScheduledBatchAggregation({ groupBy: 'clientAccount', windowStart: '00:00', windowEnd: '23:59' }, 'seed1');
    expect(result.taggedJobCount).toBe(1);
  });

  it('no real QUEUED jobs at all produces zero groups and zero tagged, never calling tagBatch', async () => {
    vi.mocked(mockPrintQueueService.getAll).mockResolvedValue({ ok: true, data: [] } as any);
    const result = await runScheduledBatchAggregation({ groupBy: 'deliveryRoute', windowStart: '08:00', windowEnd: '17:00' }, 'seed1');
    expect(result.groups).toEqual([]);
    expect(result.taggedJobCount).toBe(0);
    expect(mockPrintQueueService.tagBatch).not.toHaveBeenCalled();
  });
});

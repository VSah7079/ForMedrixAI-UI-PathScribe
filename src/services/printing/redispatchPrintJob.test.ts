// src/services/printing/redispatchPrintJob.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mockPrintQueueService', () => ({
  mockPrintQueueService: { getById: vi.fn(), markFailed: vi.fn(), retryDispatch: vi.fn(), redirectPrintJob: vi.fn() },
}));
vi.mock('./attemptPrintDelivery', () => ({
  attemptPrintDelivery: vi.fn(),
}));

import { mockPrintQueueService } from './mockPrintQueueService';
import { attemptPrintDelivery } from './attemptPrintDelivery';
import { redispatchPrintJob, redispatchManyPrintJobs, redirectAndRedispatchPrintJob, redirectAndRedispatchManyPrintJobs } from './redispatchPrintJob';

const baseJob = {
  id: 'job-1', caseId: 'CASE-1', reportType: 'FINAL' as const, priority: 'Routine' as const, mode: 'NATIVE_QZ_TRAY' as const,
  printerName: 'Front-Desk', pdfBase64: 'BASE64DATA', status: 'FAILED' as const,
};

beforeEach(() => {
  vi.mocked(mockPrintQueueService.getById).mockReset();
  vi.mocked(mockPrintQueueService.markFailed).mockReset().mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(mockPrintQueueService.retryDispatch).mockReset().mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(mockPrintQueueService.redirectPrintJob).mockReset().mockResolvedValue({ ok: true, data: {} } as any);
  vi.mocked(attemptPrintDelivery).mockReset().mockResolvedValue({ outcome: 'dispatched', jobId: 'job-1' });
});

describe('redispatchPrintJob — real, per PS-279 §2.2.3 Retry/Redirect', () => {
  it('a real job with no persisted pdfBase64 fails honestly, never attempting delivery with nothing to send', async () => {
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({ ok: true, data: { ...baseJob, pdfBase64: undefined } } as any);
    const result = await redispatchPrintJob('job-1');
    expect(result.outcome).toBe('failed');
    expect(mockPrintQueueService.markFailed).toHaveBeenCalledWith('job-1', expect.objectContaining({ errorCode: 'PRINT_REJECTED', maxRetriesExceeded: true }));
    expect(attemptPrintDelivery).not.toHaveBeenCalled();
  });

  it('a real, unknown job id fails honestly', async () => {
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({ ok: false, error: 'not found' } as any);
    const result = await redispatchPrintJob('missing');
    expect(result.outcome).toBe('failed');
    expect(attemptPrintDelivery).not.toHaveBeenCalled();
  });

  it('re-queues the real job (retryDispatch) before attempting delivery again', async () => {
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({ ok: true, data: baseJob } as any);
    await redispatchPrintJob('job-1');
    expect(mockPrintQueueService.retryDispatch).toHaveBeenCalledWith('job-1');
    expect(attemptPrintDelivery).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1', mode: 'NATIVE_QZ_TRAY', pdfBase64: 'BASE64DATA', printerName: 'Front-Desk',
    }));
  });

  it('a real Retry with no redirect ever set resends to the exact same, original resolvedDestination', async () => {
    const resolvedDestination = { protocol: 'RAW_9100' as const, ipAddress: '192.168.1.9' };
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({ ok: true, data: { ...baseJob, mode: 'DIRECT_NETWORK_PRINT', resolvedDestination } } as any);
    await redispatchPrintJob('job-1');
    expect(attemptPrintDelivery).toHaveBeenCalledWith(expect.objectContaining({ destination: resolvedDestination }));
  });

  it('a real redirectedToDestination always wins over resolvedDestination once set', async () => {
    const resolvedDestination = { protocol: 'RAW_9100' as const, ipAddress: '192.168.1.9' };
    const redirectedToDestination = { protocol: 'IPP' as const, ipAddress: '10.0.0.5' };
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({
      ok: true, data: { ...baseJob, mode: 'DIRECT_NETWORK_PRINT', resolvedDestination, redirectedToDestination },
    } as any);
    await redispatchPrintJob('job-1');
    expect(attemptPrintDelivery).toHaveBeenCalledWith(expect.objectContaining({ destination: redirectedToDestination }));
  });

  it('forwards the real, persisted paperSource/duplexMode as presentation options', async () => {
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({
      ok: true, data: { ...baseJob, paperSource: 'TRAY_2_PLAIN', duplexMode: 'SIMPLEX' },
    } as any);
    await redispatchPrintJob('job-1');
    expect(attemptPrintDelivery).toHaveBeenCalledWith(expect.objectContaining({ presentation: { paperSource: 'TRAY_2_PLAIN', duplexMode: 'SIMPLEX' } }));
  });
});

describe('redispatchManyPrintJobs — real, sequential bulk retry/redirect', () => {
  it('processes every real job id in order and collects each real, individual result', async () => {
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({ ok: true, data: baseJob } as any);
    vi.mocked(attemptPrintDelivery)
      .mockResolvedValueOnce({ outcome: 'dispatched', jobId: 'job-1' })
      .mockResolvedValueOnce({ outcome: 'failed', jobId: 'job-2' });
    const results = await redispatchManyPrintJobs(['job-1', 'job-2']);
    expect(results).toEqual([{ outcome: 'dispatched', jobId: 'job-1' }, { outcome: 'failed', jobId: 'job-2' }]);
  });
});

describe('redirectAndRedispatchPrintJob — real, one-action redirect+retry composition', () => {
  const destination = { protocol: 'IPP' as const, ipAddress: '10.0.0.5' };

  it('records the real redirect, then genuinely re-attempts delivery to the new destination', async () => {
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({ ok: true, data: baseJob } as any);
    const result = await redirectAndRedispatchPrintJob('job-1', destination, 'admin1');
    expect(mockPrintQueueService.redirectPrintJob).toHaveBeenCalledWith('job-1', destination, 'admin1');
    expect(mockPrintQueueService.retryDispatch).toHaveBeenCalledWith('job-1');
    expect(result.outcome).toBe('dispatched');
  });

  it('a real, failed redirect (e.g. unknown job id) never proceeds to a real redispatch attempt', async () => {
    vi.mocked(mockPrintQueueService.redirectPrintJob).mockResolvedValue({ ok: false, error: 'not found' } as any);
    const result = await redirectAndRedispatchPrintJob('missing', destination, 'admin1');
    expect(result.outcome).toBe('failed');
    expect(mockPrintQueueService.getById).not.toHaveBeenCalled();
  });
});

describe('redirectAndRedispatchManyPrintJobs — real, sequential bulk redirect+retry', () => {
  it('applies the real, same destination to every real, given job id in order', async () => {
    vi.mocked(mockPrintQueueService.getById).mockResolvedValue({ ok: true, data: baseJob } as any);
    const destination = { protocol: 'RAW_9100' as const, ipAddress: '10.0.0.9' };
    const results = await redirectAndRedispatchManyPrintJobs(['job-1', 'job-2'], destination, 'admin1');
    expect(mockPrintQueueService.redirectPrintJob).toHaveBeenCalledWith('job-1', destination, 'admin1');
    expect(mockPrintQueueService.redirectPrintJob).toHaveBeenCalledWith('job-2', destination, 'admin1');
    expect(results).toHaveLength(2);
  });
});

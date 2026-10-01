// src/services/digitalPathology/mockWsiScanBatchService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { NewWsiScanBatch } from './IWsiScanBatchService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const NEW_BATCH: NewWsiScanBatch = {
  scannerInstrumentId: 'WSI-01',
  slides: [
    { slidePosition: '1', caseId: 'c1', specimenId: 's1', scanStatus: 'pending' },
    { slidePosition: '2', caseId: 'c2', specimenId: 's2', scanStatus: 'pending' },
  ],
};

describe('mockWsiScanBatchService — real, per direct follow-up on Cytology Assisted Instrumentation', () => {
  it('real, create correctly sets a real, honest starting state — loaded, no dispatch/unload timestamps yet', async () => {
    const { mockWsiScanBatchService } = await import('./mockWsiScanBatchService');
    const res = await mockWsiScanBatchService.create(NEW_BATCH);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('loaded');
      expect(res.data.dispatchedAt).toBeUndefined();
      expect(res.data.unloadedAt).toBeUndefined();
      expect(res.data.batchBarcode).toMatch(/^WSI-\d{8}-\d{4}$/);
    }
  });

  it('real, markDispatched correctly moves a real, loaded batch to scanning', async () => {
    const { mockWsiScanBatchService } = await import('./mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    const dispatched = await mockWsiScanBatchService.markDispatched(created.data.id);
    expect(dispatched.ok).toBe(true);
    if (dispatched.ok) {
      expect(dispatched.data.status).toBe('scanning');
      expect(dispatched.data.dispatchedAt).toBeTruthy();
    }
  });

  it('real, direct correction verified: markDispatched refuses a real batch that is not "loaded" — a batch can only be dispatched once', async () => {
    const { mockWsiScanBatchService } = await import('./mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    await mockWsiScanBatchService.markDispatched(created.data.id);
    const second = await mockWsiScanBatchService.markDispatched(created.data.id);
    expect(second.ok).toBe(false);
  });

  it('real, honest refusal: markUnloaded refuses while any real slide is still pending/scanning — the instrument can\'t honestly be unloaded yet', async () => {
    const { mockWsiScanBatchService } = await import('./mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    const res = await mockWsiScanBatchService.markUnloaded(created.data.id);
    expect(res.ok).toBe(false);
  });

  it('real, markUnloaded correctly succeeds once every real slide reaches a real, terminal outcome, resolving to "completed" when all real slides succeeded', async () => {
    const { mockWsiScanBatchService } = await import('./mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    await mockWsiScanBatchService.updateSlideStatus(created.data.id, '1', { scanStatus: 'completed', scanCompletedAt: '2026-09-08T00:00:00.000Z' });
    await mockWsiScanBatchService.updateSlideStatus(created.data.id, '2', { scanStatus: 'completed', scanCompletedAt: '2026-09-08T00:00:00.000Z' });
    const res = await mockWsiScanBatchService.markUnloaded(created.data.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('completed');
      expect(res.data.unloadedAt).toBeTruthy();
    }
  });

  it('real, markUnloaded correctly resolves to "failed" when any real slide genuinely failed, even if others succeeded — an honest, mixed outcome', async () => {
    const { mockWsiScanBatchService } = await import('./mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    await mockWsiScanBatchService.updateSlideStatus(created.data.id, '1', { scanStatus: 'completed', scanCompletedAt: '2026-09-08T00:00:00.000Z' });
    await mockWsiScanBatchService.updateSlideStatus(created.data.id, '2', { scanStatus: 'failed', failureReason: 'Focus error' });
    const res = await mockWsiScanBatchService.markUnloaded(created.data.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe('failed');
  });

  it('real, updateSlideStatus correctly refuses a genuinely non-existent slide position', async () => {
    const { mockWsiScanBatchService } = await import('./mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    const res = await mockWsiScanBatchService.updateSlideStatus(created.data.id, '99', { scanStatus: 'completed' });
    expect(res.ok).toBe(false);
  });
});

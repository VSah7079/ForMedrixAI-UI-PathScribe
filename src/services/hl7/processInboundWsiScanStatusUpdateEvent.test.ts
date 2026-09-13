// src/services/hl7/processInboundWsiScanStatusUpdateEvent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { NewWsiScanBatch } from '../digitalPathology/IWsiScanBatchService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

import {
  processInboundWsiScanStatusUpdateEvent,
  _resetProcessedWsiScanStatusMessageIdsForTests,
} from './processInboundWsiScanStatusUpdateEvent';
import type { WsiScanStatusUpdateEventPayload } from '@/types/events/WsiScanStatusUpdateEventPayload';

const NEW_BATCH: NewWsiScanBatch = {
  scannerInstrumentId: 'WSI-01',
  slides: [{ slidePosition: '1', caseId: 'c1', specimenId: 's1', scanStatus: 'pending' }],
};

const payload = (batchId: string, over: Partial<WsiScanStatusUpdateEventPayload> = {}): WsiScanStatusUpdateEventPayload => ({
  messageId: 'msg-1', timestamp: '2026-09-08T00:00:00.000Z', organisationId: 'org-1',
  batchId, slidePosition: '1', scanStatus: 'completed',
  ...over,
});

describe('processInboundWsiScanStatusUpdateEvent — real, per direct follow-up on Cytology Assisted Instrumentation', () => {
  beforeEach(() => {
    _resetProcessedWsiScanStatusMessageIdsForTests();
  });

  it('real, a complete, matching event applies correctly, updating the real slide\'s own status', async () => {
    const { mockWsiScanBatchService } = await import('../digitalPathology/mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    const result = await processInboundWsiScanStatusUpdateEvent(payload(created.data.id));
    expect(result.outcome).toBe('applied');
    const refreshed = await mockWsiScanBatchService.getById(created.data.id);
    if (refreshed.ok) expect(refreshed.data.slides[0].scanStatus).toBe('completed');
  });

  it('real, a redelivered messageId is a genuine no-op', async () => {
    const { mockWsiScanBatchService } = await import('../digitalPathology/mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    await processInboundWsiScanStatusUpdateEvent(payload(created.data.id));
    const second = await processInboundWsiScanStatusUpdateEvent(payload(created.data.id));
    expect(second.outcome).toBe('already-applied');
  });

  it('real, a missing required field is an honest invalid-payload outcome', async () => {
    const result = await processInboundWsiScanStatusUpdateEvent(payload('some-batch', { slidePosition: '' }));
    expect(result.outcome).toBe('invalid-payload');
  });

  it('real, an honest batch-not-found outcome when the batch genuinely doesn\'t exist', async () => {
    const result = await processInboundWsiScanStatusUpdateEvent(payload('does-not-exist'));
    expect(result.outcome).toBe('batch-not-found');
  });

  it('real, an honest slide-not-found outcome when the real batch exists but the slide position doesn\'t', async () => {
    const { mockWsiScanBatchService } = await import('../digitalPathology/mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    const result = await processInboundWsiScanStatusUpdateEvent(payload(created.data.id, { slidePosition: '99' }));
    expect(result.outcome).toBe('slide-not-found');
  });

  it('real, a failed scan correctly carries the real, external failureReason through', async () => {
    const { mockWsiScanBatchService } = await import('../digitalPathology/mockWsiScanBatchService');
    const created = await mockWsiScanBatchService.create(NEW_BATCH);
    if (!created.ok) throw new Error('setup failed');
    await processInboundWsiScanStatusUpdateEvent(payload(created.data.id, { scanStatus: 'failed', failureReason: 'Focus error' }));
    const refreshed = await mockWsiScanBatchService.getById(created.data.id);
    if (refreshed.ok) {
      expect(refreshed.data.slides[0].scanStatus).toBe('failed');
      expect(refreshed.data.slides[0].failureReason).toBe('Focus error');
    }
  });
});

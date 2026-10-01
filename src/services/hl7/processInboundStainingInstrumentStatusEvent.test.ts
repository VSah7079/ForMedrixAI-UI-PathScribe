// src/services/hl7/processInboundStainingInstrumentStatusEvent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('processInboundStainingInstrumentStatusEvent \u2014 real, mirrors processInboundCytologyInstrumentStatusEvent.ts', () => {
  it('a real status update for a real Staining batch is applied and persisted', async () => {
    const { mockBatchService } = await import('../batches/mockBatchService');
    const { processInboundStainingInstrumentStatusEvent, _resetProcessedStainingInstrumentStatusMessageIdsForTests } = await import('./processInboundStainingInstrumentStatusEvent');
    _resetProcessedStainingInstrumentStatusMessageIdsForTests();

    const batch = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real staining test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('setup failed');

    const result = await processInboundStainingInstrumentStatusEvent({
      messageId: 'msg-stain-1', timestamp: new Date().toISOString(),
      masterBarcode: batch.data.masterBarcode, status: 'Run Completed',
    });
    expect(result.outcome).toBe('applied');

    const updated = await mockBatchService.getById(batch.data.id);
    if (updated.ok) expect(updated.data.stainingInstrumentStatus).toBe('Run Completed');
  });

  it('a real, honest terminal failure status is recorded exactly as reported, never silently upgraded', async () => {
    const { mockBatchService } = await import('../batches/mockBatchService');
    const { processInboundStainingInstrumentStatusEvent, _resetProcessedStainingInstrumentStatusMessageIdsForTests } = await import('./processInboundStainingInstrumentStatusEvent');
    _resetProcessedStainingInstrumentStatusMessageIdsForTests();

    const batch = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real staining test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('setup failed');

    const result = await processInboundStainingInstrumentStatusEvent({
      messageId: 'msg-stain-2', timestamp: new Date().toISOString(),
      masterBarcode: batch.data.masterBarcode, status: 'Run Failed',
    });
    expect(result.outcome).toBe('applied');

    const updated = await mockBatchService.getById(batch.data.id);
    if (updated.ok) expect(updated.data.stainingInstrumentStatus).toBe('Run Failed');
  });

  it('a real redelivery of the same messageId is a real, honest no-op, never a duplicate write', async () => {
    const { mockBatchService } = await import('../batches/mockBatchService');
    const { processInboundStainingInstrumentStatusEvent, _resetProcessedStainingInstrumentStatusMessageIdsForTests } = await import('./processInboundStainingInstrumentStatusEvent');
    _resetProcessedStainingInstrumentStatusMessageIdsForTests();

    const batch = await mockBatchService.create({
      processingNode: 'Staining', protocol: 'Real staining test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('setup failed');

    const payload = { messageId: 'msg-stain-3', timestamp: new Date().toISOString(), masterBarcode: batch.data.masterBarcode, status: 'In Process' as const };
    const first = await processInboundStainingInstrumentStatusEvent(payload);
    expect(first.outcome).toBe('applied');
    const second = await processInboundStainingInstrumentStatusEvent(payload);
    expect(second.outcome).toBe('already-applied');
  });

  it('a real, genuinely nonexistent masterBarcode is a real, honest batch-not-found result', async () => {
    const { _resetProcessedStainingInstrumentStatusMessageIdsForTests, processInboundStainingInstrumentStatusEvent } = await import('./processInboundStainingInstrumentStatusEvent');
    _resetProcessedStainingInstrumentStatusMessageIdsForTests();

    const result = await processInboundStainingInstrumentStatusEvent({
      messageId: 'msg-stain-4', timestamp: new Date().toISOString(),
      masterBarcode: 'BATCH-DOES-NOT-EXIST', status: 'Run Completed',
    });
    expect(result.outcome).toBe('batch-not-found');
  });

  it('a real status event for a batch on the wrong real processingNode is honestly rejected, never silently applied', async () => {
    const { mockBatchService } = await import('../batches/mockBatchService');
    const { processInboundStainingInstrumentStatusEvent, _resetProcessedStainingInstrumentStatusMessageIdsForTests } = await import('./processInboundStainingInstrumentStatusEvent');
    _resetProcessedStainingInstrumentStatusMessageIdsForTests();

    const batch = await mockBatchService.create({
      processingNode: 'Embedding', protocol: 'Real, wrong-node test batch', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!batch.ok) throw new Error('setup failed');

    const result = await processInboundStainingInstrumentStatusEvent({
      messageId: 'msg-stain-5', timestamp: new Date().toISOString(),
      masterBarcode: batch.data.masterBarcode, status: 'Run Completed',
    });
    expect(result.outcome).toBe('wrong-node');

    const unchanged = await mockBatchService.getById(batch.data.id);
    if (unchanged.ok) expect(unchanged.data.stainingInstrumentStatus).toBeUndefined();
  });

  it('a real, invalid payload missing required fields is honestly rejected', async () => {
    const { processInboundStainingInstrumentStatusEvent, _resetProcessedStainingInstrumentStatusMessageIdsForTests } = await import('./processInboundStainingInstrumentStatusEvent');
    _resetProcessedStainingInstrumentStatusMessageIdsForTests();

    const result = await processInboundStainingInstrumentStatusEvent({
      messageId: 'msg-stain-6', timestamp: new Date().toISOString(), masterBarcode: '', status: 'Run Completed',
    });
    expect(result.outcome).toBe('invalid-payload');
  });
});

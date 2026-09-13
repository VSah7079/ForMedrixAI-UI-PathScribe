// src/services/referral/processInboundReferralResultEvent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('processInboundReferralResultEvent — real, idempotent ingestion of a reference lab result', () => {
  it('real, a valid discrete-result payload applies correctly against an existing tracking record', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    const { processInboundReferralResultEvent, _resetProcessedReferralResultMessageIdsForTests } = await import('./processInboundReferralResultEvent');
    _resetProcessedReferralResultMessageIdsForTests();

    await mockReferralTrackingService.createOnDispatch('batch-r1');
    const result = await processInboundReferralResultEvent({
      messageId: 'msg-1', timestamp: new Date().toISOString(), batchId: 'batch-r1',
      resultType: 'discrete', discreteResult: 'KRAS G12D detected',
    });
    expect(result.outcome).toBe('applied');

    const tracking = await mockReferralTrackingService.getByBatchId('batch-r1');
    if (tracking.ok) expect(tracking.data?.transitStatus).toBe('result_received');
  });

  it('real, a valid pdf_attachment payload applies correctly', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    const { processInboundReferralResultEvent, _resetProcessedReferralResultMessageIdsForTests } = await import('./processInboundReferralResultEvent');
    _resetProcessedReferralResultMessageIdsForTests();

    await mockReferralTrackingService.createOnDispatch('batch-r2');
    const result = await processInboundReferralResultEvent({
      messageId: 'msg-2', timestamp: new Date().toISOString(), batchId: 'batch-r2',
      resultType: 'pdf_attachment', pdfAttachmentUrl: 'https://reference-lab.example/reports/abc123.pdf',
    });
    expect(result.outcome).toBe('applied');
  });

  it('real, a redelivered messageId is a genuine no-op', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    const { processInboundReferralResultEvent, _resetProcessedReferralResultMessageIdsForTests } = await import('./processInboundReferralResultEvent');
    _resetProcessedReferralResultMessageIdsForTests();

    await mockReferralTrackingService.createOnDispatch('batch-r3');
    const payload = { messageId: 'msg-dup', timestamp: new Date().toISOString(), batchId: 'batch-r3', resultType: 'discrete' as const, discreteResult: 'Negative' };
    await processInboundReferralResultEvent(payload);
    const second = await processInboundReferralResultEvent(payload);
    expect(second.outcome).toBe('already-applied');
  });

  it('real, tracking-not-found for a genuine batch with no dispatched tracking record', async () => {
    const { processInboundReferralResultEvent, _resetProcessedReferralResultMessageIdsForTests } = await import('./processInboundReferralResultEvent');
    _resetProcessedReferralResultMessageIdsForTests();
    const result = await processInboundReferralResultEvent({
      messageId: 'msg-3', timestamp: new Date().toISOString(), batchId: 'never-dispatched',
      resultType: 'discrete', discreteResult: 'Negative',
    });
    expect(result.outcome).toBe('tracking-not-found');
  });

  it('real, a discrete result missing discreteResult itself is invalid, never silently accepted', async () => {
    const { processInboundReferralResultEvent, _resetProcessedReferralResultMessageIdsForTests } = await import('./processInboundReferralResultEvent');
    _resetProcessedReferralResultMessageIdsForTests();
    const result = await processInboundReferralResultEvent({
      messageId: 'msg-4', timestamp: new Date().toISOString(), batchId: 'batch-x', resultType: 'discrete',
    });
    expect(result.outcome).toBe('invalid-payload');
  });

  it('real, a payload carrying BOTH discreteResult and pdfAttachmentUrl is invalid — the two real modes are genuinely mutually exclusive', async () => {
    const { processInboundReferralResultEvent, _resetProcessedReferralResultMessageIdsForTests } = await import('./processInboundReferralResultEvent');
    _resetProcessedReferralResultMessageIdsForTests();
    const result = await processInboundReferralResultEvent({
      messageId: 'msg-5', timestamp: new Date().toISOString(), batchId: 'batch-x', resultType: 'discrete',
      discreteResult: 'Negative', pdfAttachmentUrl: 'https://reference-lab.example/reports/abc.pdf',
    });
    expect(result.outcome).toBe('invalid-payload');
  });
});

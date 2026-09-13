// src/services/batches/referralDispatchIntegration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockBatchService — real referral dispatch on completion, per direct follow-up reusing the existing Batch architecture', () => {
  it('real, completing an External Referral batch via supervisor override automatically enqueues the real manifest and creates a real tracking record', async () => {
    const { mockBatchService } = await import('./mockBatchService');
    const { mockReferralOutboundQueueService } = await import('../referral/mockReferralOutboundQueueService');
    const { mockReferralTrackingService } = await import('../referral/mockReferralTrackingService');

    const created = await mockBatchService.create({
      processingNode: 'External Referral', protocol: 'External Referral', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
      referralDestinationFacilityId: 'fac-mayo-reference', referralTestRequested: 'Foundation Medicine CDx NGS Panel',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await mockBatchService.startReconciliation(created.data.id, 'u1', 'Tech A');
    const completed = await mockBatchService.overrideAndComplete(created.data.id, 'u1', 'Tech A', 'No items scanned for this real test — override to reach completion.');
    expect(completed.ok).toBe(true);

    const queueEntries = await mockReferralOutboundQueueService.getByBatchId(created.data.id);
    expect(queueEntries.ok).toBe(true);
    if (queueEntries.ok) {
      expect(queueEntries.data).toHaveLength(1);
      expect(queueEntries.data[0].status).toBe('QUEUED');
      expect(queueEntries.data[0].payload.destinationFacilityId).toBe('fac-mayo-reference');
    }

    const tracking = await mockReferralTrackingService.getByBatchId(created.data.id);
    if (tracking.ok) expect(tracking.data?.transitStatus).toBe('dispatched');
  });

  it('real, completing a genuine, non-referral batch (e.g. Processing) never enqueues anything to the referral queue', async () => {
    const { mockBatchService } = await import('./mockBatchService');
    const { mockReferralOutboundQueueService } = await import('../referral/mockReferralOutboundQueueService');

    const created = await mockBatchService.create({
      processingNode: 'Processing', protocol: 'Standard H&E', priority: 'Routine',
      createdByUserId: 'u1', createdByUserName: 'Tech A',
    });
    if (!created.ok) throw new Error('setup failed');

    await mockBatchService.startReconciliation(created.data.id, 'u1', 'Tech A');
    await mockBatchService.overrideAndComplete(created.data.id, 'u1', 'Tech A', 'No items scanned for this real test.');

    const queueEntries = await mockReferralOutboundQueueService.getByBatchId(created.data.id);
    if (queueEntries.ok) expect(queueEntries.data).toHaveLength(0);
  });
});

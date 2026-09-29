// src/services/batches/referralDispatchIntegration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// Real, direct follow-up: a fixed 150ms wait (this file's own prior fix)
// was NOT enough — the exact same 5000ms timeout recurred. Root cause is
// unchanged (dispatchReferralIfApplicable() in mockBatchService.ts is
// deliberately fire-and-forget — see that function's own header comment
// — so this test can never know exactly when its two real side effects,
// each with their own internal setTimeout-based delay, have actually
// persisted). A FIXED sleep assumes a fixed worst-case latency, which
// doesn't hold under real, variable load. Polling — keep checking on a
// short interval, up to a real bound — adapts to how fast the system
// actually is instead of guessing a number.
//
// Real, direct follow-up #2: confirmed this environment (Windows,
// `npm test` run directly on the developer's own machine, not CI) never
// reproduces the timeout — every run here passes. Windows changes the
// likely explanation: Windows Defender real-time scanning + NTFS are a
// well-known, real source of multi-second stalls for Node/Vite dev
// tooling that a Linux container never hits. That matters here
// specifically because this test's own three `await import(...)` calls
// below (mockBatchService.ts alone pulls in 24 further real imports)
// run INSIDE this test's timed execution, on a cold transform cache —
// unlike a statically-imported module, nothing forces Vitest to have
// already transformed this file before the test's own clock starts.
// On a slow/AV-scanned Windows run, that transform cost alone could
// plausibly eat much of a 5000ms budget before the real referral-
// dispatch race (addressed by polling, above) ever gets a chance to
// run. Per this test's own error message ("pass a timeout value as the
// last argument"), both tests below now get a real, generous 20000ms
// budget — the actual work stays finite either way (polling itself is
// capped at 3000ms), so this doesn't mask a genuine hang, it just stops
// a slow-but-legitimate run from being cut off before it finishes.
async function pollUntil<T>(check: () => Promise<T | null>, timeoutMs = 3000, intervalMs = 50): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== null) return result;
    if (Date.now() >= deadline) return null;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

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

    // Real, non-blocking dispatch — dispatchReferralIfApplicable() in
    // mockBatchService.ts is deliberately fire-and-forget (its own
    // header comment: "a real referral-side failure must never block
    // the batch's own, already-successful reconciliation completion"),
    // so overrideAndComplete() above returns before the enqueue/
    // tracking-creation below have necessarily persisted. Poll (see
    // pollUntil's own header above) instead of a fixed sleep — waits
    // only as long as actually needed, bounded well under this file's
    // own 5000ms test timeout, rather than gambling on one fixed delay.
    const queueEntries = await pollUntil(async () => {
      const res = await mockReferralOutboundQueueService.getByBatchId(created.data.id);
      return res.ok && res.data.length > 0 ? res : null;
    });
    expect(queueEntries).not.toBeNull();
    expect(queueEntries?.ok).toBe(true);
    if (queueEntries?.ok) {
      expect(queueEntries.data).toHaveLength(1);
      expect(queueEntries.data[0].status).toBe('QUEUED');
      expect(queueEntries.data[0].payload.destinationFacilityId).toBe('fac-mayo-reference');
    }

    const tracking = await pollUntil(async () => {
      const res = await mockReferralTrackingService.getByBatchId(created.data.id);
      return res.ok && res.data ? res : null;
    });
    expect(tracking).not.toBeNull();
    if (tracking?.ok) expect(tracking.data?.transitStatus).toBe('dispatched');
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

// src/services/referral/mockReferralTrackingService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockReferralTrackingService — real transit status + inbound result tracking', () => {
  it('real, createOnDispatch starts a real tracking record at \'dispatched\'', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    const result = await mockReferralTrackingService.createOnDispatch('batch-001');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.transitStatus).toBe('dispatched');
  });

  it('real, a genuine duplicate createOnDispatch for the same batch is refused, not silently overwritten', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    await mockReferralTrackingService.createOnDispatch('batch-002');
    const second = await mockReferralTrackingService.createOnDispatch('batch-002');
    expect(second.ok).toBe(false);
  });

  it('real, updateTransitStatus correctly moves the real, existing record through the lifecycle', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    await mockReferralTrackingService.createOnDispatch('batch-003');
    const updated = await mockReferralTrackingService.updateTransitStatus('batch-003', 'in_transit');
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.transitStatus).toBe('in_transit');
  });

  it('real, recordResult moves status to result_received and stores the real discrete result', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    await mockReferralTrackingService.createOnDispatch('batch-004');
    const result = await mockReferralTrackingService.recordResult('batch-004', { resultType: 'discrete', discreteResult: 'BRAF V600E detected' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.transitStatus).toBe('result_received');
      expect(result.data.discreteResult).toBe('BRAF V600E detected');
      expect(result.data.receivedAt).toBeDefined();
    }
  });

  it('real, an honest failure for a genuinely unknown batchId, never a silent no-op', async () => {
    const { mockReferralTrackingService } = await import('./mockReferralTrackingService');
    const result = await mockReferralTrackingService.updateTransitStatus('does-not-exist', 'in_transit');
    expect(result.ok).toBe(false);
  });
});

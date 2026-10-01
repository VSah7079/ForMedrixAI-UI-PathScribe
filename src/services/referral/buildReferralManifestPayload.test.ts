// src/services/referral/buildReferralManifestPayload.test.ts
import { describe, it, expect } from 'vitest';
import { buildReferralManifestPayload } from './buildReferralManifestPayload';
import type { Batch } from '../batches/IBatchService';

const REFERRAL_BATCH: Batch = {
  id: 'batch-001', masterBarcode: 'CONT-REF-20260909-0001', processingNode: 'External Referral',
  referralDestinationFacilityId: 'fac-mayo-reference', referralTestRequested: 'Foundation Medicine CDx NGS Panel',
  protocol: 'External Referral', priority: 'Routine', status: 'active',
  items: [
    { id: 'item-1', materialType: 'block', displayId: 'S26-4403-A1', caseAccession: 'S26-4403', specimenLabel: 'A', addedAt: '2026-09-09T00:00:00.000Z', addedByUserId: 'u1', addedByUserName: 'Tech A' },
  ],
  unexpectedScans: [], createdAt: '2026-09-09T00:00:00.000Z', createdByUserId: 'u1', createdByUserName: 'Tech A',
};

describe('buildReferralManifestPayload — real, per direct follow-up reusing the existing Batch architecture', () => {
  it('real, a valid External Referral batch produces the real, correctly-shaped payload', () => {
    const payload = buildReferralManifestPayload(REFERRAL_BATCH);
    expect(payload.batchId).toBe('batch-001');
    expect(payload.destinationFacilityId).toBe('fac-mayo-reference');
    expect(payload.testRequested).toBe('Foundation Medicine CDx NGS Panel');
    expect(payload.items).toEqual([{ displayId: 'S26-4403-A1', materialType: 'block', caseAccession: 'S26-4403', specimenLabel: 'A' }]);
  });

  it('real, every payload gets its own, genuinely unique messageId', () => {
    const first = buildReferralManifestPayload(REFERRAL_BATCH);
    const second = buildReferralManifestPayload(REFERRAL_BATCH);
    expect(first.messageId).not.toBe(second.messageId);
  });

  it('real, a genuine non-referral batch is refused outright, never silently building a nonsense payload', () => {
    const processingBatch: Batch = { ...REFERRAL_BATCH, processingNode: 'Processing', referralDestinationFacilityId: undefined };
    expect(() => buildReferralManifestPayload(processingBatch)).toThrow();
  });

  it('real, a referral batch with no real destination set is refused outright', () => {
    const noDestination: Batch = { ...REFERRAL_BATCH, referralDestinationFacilityId: undefined };
    expect(() => buildReferralManifestPayload(noDestination)).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { buildDispatchTrail, shouldResendRedelivery, filterDispatchTrail, countDispatchTrail } from './buildDispatchTrail';
import type { OrderCreationEventPayload } from './IInterfaceEngineService';

const ev = (messageId: string, accession: string): OrderCreationEventPayload => ({
  messageId, eventType: 'OrderCreated', eventTimestamp: '2026-09-24T00:00:00Z', organisationId: 'ENT-1',
  patient: { patientDataScope: 'reference', identifier: 'MRN' }, order: { placerOrderNumber: accession, priority: 'Routine' }, specimens: [],
});

describe('buildDispatchTrail', () => {
  it('joins outcomes; an event with no stored outcome is "recorded" (unknown), never assumed delivered', () => {
    const trail = buildDispatchTrail([ev('m2', 'S26-2'), ev('m1', 'S26-1')], {
      m2: { status: 'failed', attemptedAt: 't', attempts: 1, error: 'down', errorCode: 'DISPATCH_UNREACHABLE' },
    });
    expect(trail.map(r => [r.payload.messageId, r.status])).toEqual([['m2', 'failed'], ['m1', 'recorded']]);
    expect(trail[0].errorCode).toBe('DISPATCH_UNREACHABLE');
  });
});

describe('shouldResendRedelivery', () => {
  it('only a failed send is re-sent', () => {
    expect(shouldResendRedelivery({ status: 'failed', attemptedAt: 't', attempts: 1 })).toBe(true);
    expect(shouldResendRedelivery({ status: 'delivered', attemptedAt: 't', attempts: 1 })).toBe(false);
    expect(shouldResendRedelivery(undefined)).toBe(false);
  });
});

describe('filter and counts', () => {
  const trail = buildDispatchTrail([ev('m3', 'S26-3'), ev('m2', 'S26-2'), ev('m1', 'S26-1')], {
    m3: { status: 'delivered', attemptedAt: 't', attempts: 1 },
    m2: { status: 'failed', attemptedAt: 't', attempts: 1 },
  });
  it('counts every status', () => {
    expect(countDispatchTrail(trail)).toEqual({ all: 3, delivered: 1, failed: 1, recorded: 1 });
  });
  it('filters by status and searches message id or accession', () => {
    expect(filterDispatchTrail(trail, 'failed', '').map(r => r.payload.messageId)).toEqual(['m2']);
    expect(filterDispatchTrail(trail, 'all', 's26-3').map(r => r.payload.messageId)).toEqual(['m3']);
    expect(filterDispatchTrail(trail, 'all', 'M1').map(r => r.payload.messageId)).toEqual(['m1']);
  });
});

// src/services/lisIngestion/stagingRules.test.ts — the universal staging queue's rules.
import { describe, it, expect } from 'vitest';
import {
  stageUpdates, workableEvents, recordAttempt, retryFailed, trimQueue, recentEvents, countByState,
  updateFingerprint, MAX_ATTEMPTS,
} from './stagingRules';
import type { NormalizedLisUpdate, StagedLisEvent } from './types';

const u = (over: Partial<NormalizedLisUpdate> = {}): NormalizedLisUpdate =>
  ({ accession: 'A1', lisStatus: 'GROSSED', updatedAt: '2026-09-24T10:00:00Z', grossText: 'g', ...over });
let n = 0;
const opts = () => ({ now: `2026-09-24T12:00:${String(n++).padStart(2, '0')}Z`, newId: () => `e${n++}` });

describe('stageUpdates', () => {
  it('stages new updates as pending, with the source', () => {
    const res = stageUpdates([], [u()], 'hl7v2', opts());
    expect(res.added).toHaveLength(1);
    expect(res.queue[0]).toMatchObject({ accession: 'A1', source: 'hl7v2', state: 'pending', attempts: 0 });
  });

  it('skips an update already staged, however it arrived', () => {
    const first = stageUpdates([], [u()], 'hl7v2', opts());
    const again = stageUpdates(first.queue, [u(), u({ lisStatus: ' grossed ' })], 'poll', opts());
    expect(again).toMatchObject({ duplicates: 2, added: [] });
  });

  it('treats changed text or a later LIS time as a new update', () => {
    expect(updateFingerprint(u())).not.toBe(updateFingerprint(u({ grossText: 'amended' })));
    expect(updateFingerprint(u())).not.toBe(updateFingerprint(u({ updatedAt: '2026-09-24T11:00:00Z' })));
  });
});

describe('workableEvents / recordAttempt / retryFailed', () => {
  const staged = () => stageUpdates([], [
    u({ accession: 'late', updatedAt: '2026-09-24T12:00:00Z' }),
    u({ accession: 'early', updatedAt: '2026-09-24T09:00:00Z' }),
  ], 'poll', opts()).queue;

  it('orders by LIS time, oldest first', () => {
    expect(workableEvents(staged()).map(e => e.accession)).toEqual(['early', 'late']);
  });

  it('records success and failure', () => {
    const q = staged();
    const [a, b] = q;
    const next = recordAttempt(recordAttempt(q, a.id, { ok: true, outcome: 'draft_prepared' }, 'T'), b.id, { ok: false, error: 'boom' }, 'T');
    expect(next.find(e => e.id === a.id)).toMatchObject({ state: 'processed', outcome: 'draft_prepared', attempts: 1, processedAt: 'T' });
    expect(next.find(e => e.id === b.id)).toMatchObject({ state: 'failed', error: 'boom', attempts: 1 });
    expect(workableEvents(next).map(e => e.id)).toEqual([b.id]);
  });

  it('stops retrying after MAX_ATTEMPTS until an admin retries', () => {
    let q = staged().slice(0, 1);
    for (let i = 0; i < MAX_ATTEMPTS; i++) q = recordAttempt(q, q[0].id, { ok: false, error: 'x' }, 'T');
    expect(workableEvents(q)).toEqual([]);
    const { queue, retried } = retryFailed(q);
    expect(retried).toBe(1);
    expect(queue[0]).toMatchObject({ state: 'pending', attempts: 0 });
    expect(queue[0].error).toBeUndefined();
  });
});

describe('trimQueue / recentEvents / countByState', () => {
  it('keeps pending and failed events and only the newest processed ones', () => {
    const ev = (id: string, state: StagedLisEvent['state'], processedAt?: string) =>
      ({ ...u(), id, source: 'poll', receivedAt: id, fingerprint: id, state, attempts: 1, processedAt }) as StagedLisEvent;
    const q = [ev('p1', 'processed', '1'), ev('p2', 'processed', '2'), ev('p3', 'processed', '3'), ev('f', 'failed'), ev('w', 'pending')];
    expect(trimQueue(q, 2).map(e => e.id).sort()).toEqual(['f', 'p2', 'p3', 'w']);
    expect(countByState(q)).toEqual({ pending: 1, processed: 3, failed: 1 });
    expect(recentEvents(q, 2).map(e => e.id)).toEqual(['w', 'p3']);
  });
});

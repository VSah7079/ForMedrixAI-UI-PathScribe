// src/services/interfaceEngine/mockInterfaceEngineService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockInterfaceEngineService } from './mockInterfaceEngineService';
import type { OrderCreationEventPayload } from './IInterfaceEngineService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  // Real, per direct guidance (real outbound HTTP dispatch transport):
  // postOrderCreated now genuinely dispatches — mocked here by default
  // to a real success response, so every existing test below stays
  // focused on its own real, original concern (idempotency, org
  // scoping, ordering) without also depending on network reachability.
  // The two new tests further down override this to prove the real
  // success/failure paths specifically.
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
});

function makePayload(overrides: Partial<OrderCreationEventPayload> = {}): OrderCreationEventPayload {
  return {
    messageId: 'evt-order-TEST-001',
    eventType: 'OrderCreated',
    eventTimestamp: '2026-08-12T07:30:00.000Z',
    organisationId: 'ORG-A',
    patient: { patientDataScope: 'full', identifier: 'MRN-1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1980-05-15' },
    order: { placerOrderNumber: 'S26-1', priority: 'Routine' },
    specimens: [{ label: 'A' }],
    ...overrides,
  };
}

describe('mockInterfaceEngineService — real feature, per direct follow-up: the actual trigger for a Category E OrderCreated event', () => {
  it('postOrderCreated records a real, new event and reports it delivered', async () => {
    const result = await mockInterfaceEngineService.postOrderCreated(makePayload());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.delivered).toBe(true);
  });

  it('a recorded event is genuinely retrievable via listDispatchedEvents', async () => {
    await mockInterfaceEngineService.postOrderCreated(makePayload());
    const result = await mockInterfaceEngineService.listDispatchedEvents('ORG-A');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].messageId).toBe('evt-order-TEST-001');
    }
  });

  it('real idempotency, per the formal spec\'s own §2.3: a redelivered event with the same messageId is not double-recorded', async () => {
    await mockInterfaceEngineService.postOrderCreated(makePayload());
    await mockInterfaceEngineService.postOrderCreated(makePayload());
    const result = await mockInterfaceEngineService.listDispatchedEvents('ORG-A');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it('a genuinely malformed payload (missing messageId) is honestly rejected, not silently recorded', async () => {
    const malformed = makePayload({ messageId: '' });
    const result = await mockInterfaceEngineService.postOrderCreated(malformed);
    expect(result.ok).toBe(false);
  });

  it('listDispatchedEvents is real, per-organisation scoped — never leaks another org\'s real events', async () => {
    await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-a', organisationId: 'ORG-A' }));
    await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-b', organisationId: 'ORG-B' }));
    const resultA = await mockInterfaceEngineService.listDispatchedEvents('ORG-A');
    if (resultA.ok) {
      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0].messageId).toBe('evt-a');
    }
  });

  it('listDispatchedEvents returns most-recent-first', async () => {
    await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-first' }));
    await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-second' }));
    const result = await mockInterfaceEngineService.listDispatchedEvents('ORG-A');
    if (result.ok) expect(result.data.map(e => e.messageId)).toEqual(['evt-second', 'evt-first']);
  });

  it('real, per direct guidance (real outbound HTTP dispatch transport): postOrderCreated genuinely dispatches the real payload to the real receiving endpoint', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockClear(); // real, needed: earlier tests in this file also trigger real dispatch calls now
    const result = await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-dispatch-test' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse((requestInit as RequestInit).body as string);
    expect(sentBody.transactionType).toBe('ORDER_CREATED');
    expect(sentBody.queueEntryId).toBe('evt-dispatch-test');
    expect(sentBody.payload.messageId).toBe('evt-dispatch-test');
  });

  it('real, per direct guidance: a genuine dispatch failure reports delivered: false with the real error, not a silently-swallowed success', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Unknown transactionType' }), { status: 422 }));
    const result = await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-dispatch-fail' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.delivered).toBe(false);
    expect(result.data.error).toContain('Unknown transactionType');
    // Real, per direct guidance: a real dispatch failure still means
    // the case-creation trigger itself succeeded — the event was
    // genuinely recorded locally (real idempotency/inspection intact)
    // even though the real, external dispatch attempt failed.
    const listResult = await mockInterfaceEngineService.listDispatchedEvents('ORG-A');
    if (listResult.ok) expect(listResult.data.some(e => e.messageId === 'evt-dispatch-fail')).toBe(true);
  });

  it('Batch 318 (PS-86): the dispatch trail carries each event\'s real outcome', async () => {
    await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-ok' }));
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Unknown transactionType' }), { status: 422 }));
    await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-bad' }));
    const trail = await mockInterfaceEngineService.listDispatchTrail();
    expect(trail.ok).toBe(true);
    if (!trail.ok) return;
    const byId = Object.fromEntries(trail.data.map(r => [r.payload.messageId, r]));
    expect(byId['evt-ok'].status).toBe('delivered');
    expect(byId['evt-bad'].status).toBe('failed');
    expect(byId['evt-bad'].error).toContain('Unknown transactionType');
    expect(byId['evt-bad'].errorCode).toBe('DISPATCH_REJECTED');
    expect(trail.data.map(r => r.payload.messageId)).toEqual(['evt-bad', 'evt-ok']);
  });

  it('Batch 318 fix: redelivering a previously FAILED event re-sends it instead of claiming it was delivered', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'down' }), { status: 503 }));
    const first = await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-retry' }));
    expect(first.ok && first.data.delivered).toBe(false);

    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const second = await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-retry' }));
    expect(second.ok && second.data.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const trail = await mockInterfaceEngineService.listDispatchTrail();
    const rec = trail.ok ? trail.data.find(r => r.payload.messageId === 'evt-retry') : undefined;
    expect(rec?.status).toBe('delivered');
    expect(rec?.attempts).toBe(2);
    // Still recorded once (idempotency).
    const list = await mockInterfaceEngineService.listDispatchedEvents('ORG-A');
    expect(list.ok && list.data.filter(e => e.messageId === 'evt-retry')).toHaveLength(1);
  });

  it('a redelivered, already-delivered event is not re-sent', async () => {
    await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-once' }));
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockClear();
    const again = await mockInterfaceEngineService.postOrderCreated(makePayload({ messageId: 'evt-once' }));
    expect(again.ok && again.data.delivered).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


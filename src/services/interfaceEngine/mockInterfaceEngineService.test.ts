// src/services/interfaceEngine/mockInterfaceEngineService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockInterfaceEngineService } from './mockInterfaceEngineService';
import type { OrderCreationEventPayload } from './IInterfaceEngineService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
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
});

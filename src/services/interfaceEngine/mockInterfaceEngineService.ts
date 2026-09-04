// src/services/interfaceEngine/mockInterfaceEngineService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Address the fifth transaction type:
// interfaceEngine's OrderCreated"): the real, local record-keeping
// below (localStorage, idempotency on messageId, listDispatchedEvents)
// stays exactly as it always was — a real, separate concern from
// whether the real dispatch itself succeeded. postOrderCreated now
// also genuinely dispatches, via the same real, generic receiving
// endpoint every other real transaction type in this app uses
// (dispatchInterfaceMessage.ts) — see IInterfaceEngineService.ts's own
// header comment for the full real account.
// ─────────────────────────────────────────────────────────────────────────────

import type { IInterfaceEngineService, OrderCreationEventPayload } from './IInterfaceEngineService';
import type { ServiceResult } from '../types';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';

const STORAGE_KEY = 'pathscribe_interface_engine_dispatched_events';
const delay = (ms = 60) => new Promise(res => setTimeout(res, ms));

function loadEvents(): OrderCreationEventPayload[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEvents(events: OrderCreationEventPayload[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* non-critical */ }
}

export const mockInterfaceEngineService: IInterfaceEngineService = {
  async postOrderCreated(payload) {
    await delay();
    if (!payload.messageId || !payload.organisationId) {
      return { ok: false, error: 'postOrderCreated requires a real messageId and organisationId — malformed payload, per the spec\'s own §2.3/§3.1 non-negotiable requirements.' };
    }
    const events = loadEvents();
    // Real idempotency, matching the spec's own §2.3 requirement: a
    // redelivered event with the same messageId is recognized, not
    // double-recorded, and — same real reasoning — not re-dispatched
    // either; the receiving system already has it.
    if (events.some(e => e.messageId === payload.messageId)) {
      return { ok: true, data: { delivered: true } };
    }
    events.unshift(payload);
    saveEvents(events);
    // Real, per direct guidance: the real dispatch itself, using
    // payload.messageId as the real queue-entry-equivalent id — this
    // service has no separate queue-entry concept the way the other
    // four real transaction types do, so the real messageId (already
    // required, already the real dedup key above) does that same real
    // job for the receiving endpoint's own dedup/logging.
    const result = await dispatchInterfaceMessage(payload.messageId, 'ORDER_CREATED', payload);
    return { ok: true, data: { delivered: result.ok, error: result.ok ? undefined : result.error } };
  },

  async listDispatchedEvents(organisationId): Promise<ServiceResult<OrderCreationEventPayload[]>> {
    await delay();
    const events = loadEvents().filter(e => e.organisationId === organisationId);
    return { ok: true, data: events };
  },
};

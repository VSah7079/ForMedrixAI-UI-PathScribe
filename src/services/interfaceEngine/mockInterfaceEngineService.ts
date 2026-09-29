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

import type { DispatchOutcome, IInterfaceEngineService, OrderCreatedDispatchRecord, OrderCreationEventPayload } from './IInterfaceEngineService';
import type { ServiceResult } from '../types';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { buildDispatchTrail, shouldResendRedelivery } from './buildDispatchTrail';

const STORAGE_KEY = 'pathscribe_interface_engine_dispatched_events';
/** Dispatch outcome per messageId (Batch 318, PS-86). Kept beside the event
 *  log rather than inside it, so the stored events stay exactly the payloads
 *  that were sent. */
const OUTCOME_KEY = 'pathscribe_interface_engine_dispatch_outcomes';
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

function loadOutcomes(): Record<string, DispatchOutcome> {
  try {
    const raw = localStorage.getItem(OUTCOME_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOutcome(messageId: string, outcome: DispatchOutcome): void {
  try {
    const all = loadOutcomes();
    all[messageId] = outcome;
    localStorage.setItem(OUTCOME_KEY, JSON.stringify(all));
  } catch { /* non-critical */ }
}

/** Sends the event and stores what happened. */
async function sendAndRecord(payload: OrderCreationEventPayload, previousAttempts: number): Promise<{ delivered: boolean; error?: string }> {
  // payload.messageId doubles as the queue-entry id: this service has no
  // separate queue-entry concept the way the other outbound queues do, and
  // messageId is already the dedup key.
  const result = await dispatchInterfaceMessage(payload.messageId, 'ORDER_CREATED', payload);
  saveOutcome(payload.messageId, {
    status: result.ok ? 'delivered' : 'failed',
    attemptedAt: new Date().toISOString(),
    attempts: previousAttempts + 1,
    ...(result.ok ? {} : { error: result.error, errorCode: result.errorCode }),
  });
  return { delivered: result.ok, error: result.ok ? undefined : result.error };
}

export const mockInterfaceEngineService: IInterfaceEngineService = {
  async postOrderCreated(payload) {
    await delay();
    if (!payload.messageId || !payload.organisationId) {
      return { ok: false, error: 'postOrderCreated requires a real messageId and organisationId — malformed payload, per the spec\'s own §2.3/§3.1 non-negotiable requirements.' };
    }
    const events = loadEvents();
    // Idempotency (spec §2.3): a redelivered event with the same messageId
    // is never double-recorded. Batch 318 fix: it used to report
    // `delivered: true` unconditionally, even when the first send had
    // FAILED, so a caller could never learn that the receiver never got
    // it. Now a previously failed event is re-sent (and its outcome
    // updated); a delivered one isn't.
    if (events.some(e => e.messageId === payload.messageId)) {
      const previous = loadOutcomes()[payload.messageId];
      if (shouldResendRedelivery(previous)) {
        return { ok: true, data: await sendAndRecord(payload, previous!.attempts) };
      }
      return { ok: true, data: { delivered: true } };
    }
    events.unshift(payload);
    saveEvents(events);
    return { ok: true, data: await sendAndRecord(payload, 0) };
  },

  async listDispatchedEvents(organisationId): Promise<ServiceResult<OrderCreationEventPayload[]>> {
    await delay();
    const events = loadEvents().filter(e => e.organisationId === organisationId);
    return { ok: true, data: events };
  },

  async listDispatchTrail(): Promise<ServiceResult<OrderCreatedDispatchRecord[]>> {
    await delay();
    return { ok: true, data: buildDispatchTrail(loadEvents(), loadOutcomes()) };
  },
};

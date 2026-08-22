// src/services/interfaceEngine/mockInterfaceEngineService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, honest limitation — see IInterfaceEngineService.ts's own header
// comment: no real backend/transport exists yet (formal spec's own
// Appendix B item 6). This records every real dispatch to localStorage,
// inspectable via listDispatchedEvents — the same real, testable-without-a-
// server posture every other mock service in this app already uses, not a
// stub that silently does nothing.
// ─────────────────────────────────────────────────────────────────────────────

import type { IInterfaceEngineService, OrderCreationEventPayload } from './IInterfaceEngineService';
import type { ServiceResult } from '../types';

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
    // double-recorded.
    if (events.some(e => e.messageId === payload.messageId)) {
      return { ok: true, data: { delivered: true } };
    }
    events.unshift(payload);
    saveEvents(events);
    return { ok: true, data: { delivered: true } };
  },

  async listDispatchedEvents(organisationId): Promise<ServiceResult<OrderCreationEventPayload[]>> {
    await delay();
    const events = loadEvents().filter(e => e.organisationId === organisationId);
    return { ok: true, data: events };
  },
};

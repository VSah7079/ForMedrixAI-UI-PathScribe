// src/services/interfaceEngine/buildDispatchTrail.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure rules behind the Audit Log's Outbound Dispatches trail (PS-86, Batch 318).
// ─────────────────────────────────────────────────────────────────────────────

import type { DispatchOutcome, DispatchOutcomeStatus, OrderCreatedDispatchRecord, OrderCreationEventPayload } from './IInterfaceEngineService';

/** Joins the recorded events (already most-recent-first) with their stored
 *  outcomes. An event with no stored outcome predates outcome tracking:
 *  'recorded', honestly unknown, never assumed delivered. */
export function buildDispatchTrail(
  events: OrderCreationEventPayload[],
  outcomes: Record<string, DispatchOutcome>,
): OrderCreatedDispatchRecord[] {
  return events.map(payload => {
    const o = outcomes[payload.messageId];
    return o
      ? { payload, status: o.status, attemptedAt: o.attemptedAt, attempts: o.attempts, error: o.error, errorCode: o.errorCode }
      : { payload, status: 'recorded' as const };
  });
}

/** Should a redelivered event (same messageId) be sent again? Only when its
 *  last send failed. A delivered event isn't re-sent (spec §2.3
 *  idempotency: the receiver already has it), and neither is a legacy
 *  event whose outcome was never stored. */
export function shouldResendRedelivery(previous: DispatchOutcome | undefined): boolean {
  return previous?.status === 'failed';
}

export type DispatchTrailFilter = 'all' | DispatchOutcomeStatus;

export function filterDispatchTrail(records: OrderCreatedDispatchRecord[], filter: DispatchTrailFilter, search: string): OrderCreatedDispatchRecord[] {
  const q = search.trim().toLowerCase();
  return records.filter(r =>
    (filter === 'all' || r.status === filter) &&
    (!q || r.payload.messageId.toLowerCase().includes(q) || r.payload.order.placerOrderNumber.toLowerCase().includes(q)),
  );
}

/** Counts per status, for the filter pills. */
export function countDispatchTrail(records: OrderCreatedDispatchRecord[]): Record<DispatchTrailFilter, number> {
  const counts: Record<DispatchTrailFilter, number> = { all: records.length, delivered: 0, failed: 0, recorded: 0 };
  for (const r of records) counts[r.status] += 1;
  return counts;
}

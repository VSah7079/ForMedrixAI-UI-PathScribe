// src/services/engravers/fetchDispatchHistoryForCase.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own decision: a complete, permanent
// clinical audit trail of every cassette dispatch outcome and block
// exception for a case - not just the non-routine ones a technician
// needs a toast for. Reads pending_engine_notifications, which this
// session's own webhook endpoints already persist every real event
// into (cassette-dispatch-outcome.ts now persists every outcome,
// including routine 'dispatched' ones, per direct guidance's own
// decision - see that file's own header for the full reasoning).
//
// Real, deliberate scope, per direct guidance's own spec: only the two
// named event types (cassette-dispatch-outcome, block-exception).
// material-location is deliberately excluded - that history already
// has its own, real, working display (MaterialLocation[] on each
// specimen/block, rendered by MaterialTrackingHistoryModal.tsx's own
// per-item timeline), and conflating a third, structurally different
// event type into this same view was never asked for.
//
// Real, disclosed data limitation: CassetteDispatchOutcomeEventPayload
// only ever carries an optional specimenLabel, never a block-level
// identifier - the Engine reports dispatch outcomes at specimen
// granularity, not block granularity. A caller rendering this history
// per-block (rather than per-case or per-specimen) would have no real
// way to attribute a dispatch-outcome entry to one specific block.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import type { CassetteDispatchOutcomeEventPayload } from '@/types/events/CassetteDispatchOutcomeEventPayload';
import type { BlockExceptionEventPayload } from '@/types/events/BlockExceptionEventPayload';

const NOTIFICATIONS_COLLECTION = 'pending_engine_notifications';

export type DispatchHistoryEntry =
  | { eventType: 'cassette-dispatch-outcome'; createdAt: string; payload: CassetteDispatchOutcomeEventPayload }
  | { eventType: 'block-exception'; createdAt: string; payload: BlockExceptionEventPayload };

/**
 * Real, complete, chronological (newest-first) history of every
 * cassette dispatch outcome and block exception ever recorded for a
 * case - kept for the lifetime of the case, per direct guidance's own
 * retention decision (no TTL, no per-case cap; a real case is a
 * naturally bounded entity - 1 to ~100 cassettes even on a large
 * resection, trivial storage overhead).
 */
export async function fetchDispatchHistoryForCase(caseId: string): Promise<DispatchHistoryEntry[]> {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('caseId', '==', caseId),
    where('eventType', 'in', ['cassette-dispatch-outcome', 'block-exception']),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return { eventType: data.eventType, createdAt: data.createdAt, payload: data.payload } as DispatchHistoryEntry;
  });
}

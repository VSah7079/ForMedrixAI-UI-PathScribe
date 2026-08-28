// src/services/hl7/notifyBlockExceptionApplied.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, deliberate SEPARATE function from processBlockExceptionEvent.ts
// — that function both mutates the case AND is what the Dev Tools "Sim
// Block Exception" button calls directly (no backend involved in that
// simulated flow, so mutate-and-that's-it is correct there).
//
// For a REAL Engine-reported event, the backend webhook
// (api/webhooks/engine/block-exception.ts) has already applied the
// mutation server-side via applyEngineCaseUpdate before this ever
// runs. usePendingEngineNotifications.ts calls THIS function instead
// of processBlockExceptionEvent — calling the mutating function here
// too would apply the same real exception a second time, against
// whatever the case looks like NOW rather than what it looked like
// when the Engine's event was first applied — a real, silent double-
// write bug, not a duplicate-notification annoyance.
//
// Real, minimal idempotency: same messageId-based Set every sibling
// notification-only function in this file's own module family uses —
// scoped to notification display only; the backend's own Firestore-
// based claimMessageId already owns the real, authoritative "was this
// event processed" guarantee (idempotency.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from 'react-toastify';
import { caseRouter } from '../cases/CaseRouter';

export interface BlockExceptionNotificationPayload {
  messageId: string;
  caseId: string;
  specimenLetter: string;
  blockNumber: string;
  status: 'Lost' | 'Damaged';
  note?: string;
}

const notifiedMessageIds = new Set<string>();

export async function notifyBlockExceptionApplied(payload: BlockExceptionNotificationPayload): Promise<void> {
  if (notifiedMessageIds.has(payload.messageId)) return;

  const caseData = await caseRouter.getCase(payload.caseId);
  const accession = caseData?.accession?.fullAccession ?? payload.caseId;

  toast.warn(`🔬 ${accession}: Block ${payload.specimenLetter}${payload.blockNumber} reported ${payload.status}${payload.note ? ` — ${payload.note}` : ''}`);
  notifiedMessageIds.add(payload.messageId);
}

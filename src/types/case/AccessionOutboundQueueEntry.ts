// src/types/case/AccessionOutboundQueueEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Structured Clinical History Dictionary &
// Accessioning Integration" spec's own User Story 5 ("PathScribe
// publishes an order.accessioned event via webhook / message broker...
// emit a order.deficiency.created JSON webhook payload"). Mirrors
// CytologyOutboundResultQueueEntry.ts's own real, established shape
// exactly — same real "we trigger the json packages and the interface
// engine generates the formatted messages" split, one real, shared
// queue covering both real event types this story calls for rather
// than two, near-duplicate queues.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClinicalHistoryAccessionEventPayload } from '@/types/events/ClinicalHistoryAccessionEventPayload';
import type { ClinicalHistoryValidationError } from '@/services/clinicalHistory/validateClinicalHistoryAccessionPayload';

/** Real, per Acceptance Criteria 3 — "the full structured clinical
 *  history JSON array." Reuses ClinicalHistoryAccessionEventPayload's
 *  own real shape (orderId + clinicalHistory) rather than a second,
 *  parallel payload type for what is genuinely the same real data. */
export interface OrderAccessionedPayload extends ClinicalHistoryAccessionEventPayload {}

/** Real, per Acceptance Criteria 2 — the real, detailed validation
 *  errors an interface engine needs "to log," per Story 2's own
 *  established wording for the same real concept. */
export interface OrderDeficiencyCreatedPayload {
  messageId: string;
  timestamp: string;
  orderId: string;
  errors: ClinicalHistoryValidationError[];
}

export interface AccessionOutboundQueueEntry {
  id: string;
  caseId: string;
  eventType: 'order.accessioned' | 'order.deficiency.created';
  payload: OrderAccessionedPayload | OrderDeficiencyCreatedPayload;
  organisationId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}

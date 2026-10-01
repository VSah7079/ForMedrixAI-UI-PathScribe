// src/types/events/AiScreeningResultEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING a completed
// (or failed/timed-out) AI screening result from the real interface
// engine — same real "PathScribe publishes/ingests its own
// specification; the real interface engine owns the actual vendor-
// specific parsing and crosswalk" split already proven for HPV
// results, molecular batch results, and clinical history accessioning.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiScreeningFinding, AiSlideTriageSummary } from '@/types/digitalPathology/AiScreeningResult';

export interface AiScreeningResultEventPayload {
  messageId: string;
  timestamp: string;
  /** The real, existing AiScreeningResult.id this event completes —
   *  set when order() was called, never generated here. */
  resultId: string;
  status: 'completed' | 'failed' | 'timed_out';
  findings?: AiScreeningFinding[];
  /** Real, per AiScreeningResult.slideTriage's own doc comment — the
   *  real interface engine's own place to crosswalk a vendor's real
   *  whole-slide rank/gate onto, when that vendor's own product
   *  reports one. */
  slideTriage?: AiSlideTriageSummary;
}

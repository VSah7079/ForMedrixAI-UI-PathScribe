// src/types/patients/OutboundPatientAdtQueueEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("we trigger the json packages and the
// interface engine generates the formatted messages") and the
// attached Pathology HL7 Outbound Feature Spec's own Section 4
// ("Patient Management & Administrative Transactions"): the real
// outbound queue for the three ADT event types that spec actually
// requires — ADT^A08 (Demographic Update), ADT^A40 (Merge Patient),
// ADT^A47 (Change Identifier). Deliberately does NOT cover ADT^A24
// (Link) or ADT^A43 (Move Patient Information) — the spec's own
// registry doesn't list either as a required outbound transaction;
// matching the document rather than assuming symmetry with A40/A47
// just because they felt similar in earlier discussion.
//
// Mirrors types/billing/OutboundChargeQueueEntry.ts's own proven
// architecture exactly — same real reasoning: this queue entry is a
// lightweight REFERENCE + dedup key + status tracker, not a
// pre-built payload. The actual enriched JSON package (real names,
// MRNs, assigning authorities) is built lazily, at real dispatch
// time, by buildPatientAdtPayload.ts — never duplicated here, so a
// later demographic correction can't leave a stale, already-queued
// payload silently out of date.
// ─────────────────────────────────────────────────────────────────────────────

export type PatientAdtEventType = 'A08_DEMOGRAPHIC_UPDATE' | 'A40_MERGE_PATIENT' | 'A47_CHANGE_IDENTIFIER';

export interface OutboundPatientAdtQueueEntry {
  /** Real UUID — the external "TransactionID" a downstream interface
   *  engine dedupes against, same real reasoning as
   *  OutboundChargeQueueEntry.id. */
  id: string;
  eventType: PatientAdtEventType;
  organisationId: string;
  /** For A08: the one patient whose demographics changed. For A40:
   *  the provisional/merged-away patient (MRG-1's own "prior
   *  identifier"). For A47: the downtime/temporary patient being
   *  rebound. */
  sourcePatientId: string;
  /** Undefined for A08 (same patient, no second identity involved).
   *  For A40: the surviving, confirmed patient. For A47: the
   *  confirmed patient the temporary identity rebinds to. */
  targetPatientId?: string;
  /** Real, per direct guidance's own established pattern
   *  (OutboundChargeQueueEntry.triggerEvent) — the real PathScribe
   *  operation id/method name that produced this entry, for a real,
   *  honest audit trail of what actually happened, distinct from the
   *  HL7-level eventType above. */
  sourceOperation: 'mergeIntoExistingPatient' | 'breakGlassRebind' | 'updateDemographics';
  /** Real Story-3-style concern (payload generation/actual dispatch)
   *  — 'QUEUED' is the only real status this queue itself produces.
   *  'SENT'/'FAILED' are left here, not fabricated as working, same
   *  honest-stub posture as OutboundChargeQueueEntry — this app has
   *  no real dispatch transport to an actual interface-engine
   *  endpoint, here any more than it does for billing charges. */
  /** Real, per direct guidance ("look to see that the json packages
   *  coming out of PS are correct" — real dispatch needs the real
   *  values buildAdt40Payload()/buildAdt47Payload() actually require,
   *  not a fabricated placeholder at dispatch time). Captured here, at
   *  the real enqueue moment, since that's the only point these real
   *  counts are actually known — mergeIntoExistingPatient()/
   *  breakGlassRebind() both compute them directly. Undefined for A08
   *  (neither applies) and for any queue entry enqueued before this
   *  field existed — real dispatch of an older entry falls back
   *  honestly to 0, never a guessed non-zero value. */
  casesRepointed?: number;
  /** Same real reasoning as casesRepointed above — A40 only. */
  encountersRepointed?: number;
  /** Same real reasoning as casesRepointed above — A47 only, the real
   *  reasonCode/notes a real breakGlassRebind() caller actually
   *  supplied. */
  reasonCode?: string;
  notes?: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  /** Real, per direct follow-up ("We are logging interface errors
   *  with human readable error messaging?"): 'DISPATCH_UNREACHABLE'
   *  is new — a real, meaningful distinction from 'DISPATCH_REJECTED'.
   *  'DISPATCH_UNREACHABLE' means the real network call itself failed
   *  (connection refused, DNS failure, CORS) — the receiving endpoint
   *  never got the request at all, suggesting the interface engine
   *  itself may be down. 'DISPATCH_REJECTED' means the real request
   *  reached the receiving endpoint, which responded with a real,
   *  non-2xx status — the engine is up, but rejected this specific
   *  message (a real validation failure, a real server error). These
   *  mean genuinely different things operationally and previously both
   *  collapsed into 'DISPATCH_REJECTED' for every real failure,
   *  regardless of which had actually happened. */
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}

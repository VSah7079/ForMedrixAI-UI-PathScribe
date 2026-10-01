// src/types/case/OutboundLisSyncQueueEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (gap #7 — "Assist-mode's sendSynopticReportToLis
// is still purely cosmetic (simulated 400ms delay, no real persistence)
// — never brought up to the same honest 'real queue' standard as
// A08/A40/A47/ORU"). Mirrors OutboundResultQueueEntry.ts's own proven
// architecture exactly: a lightweight reference + dedup key + status
// tracker, never a pre-built payload — sendSynopticReportToLis.ts's own
// real, already-correct payload-building logic (embeddedHeader,
// fullPayloadText, transactionStatusFlag) stays exactly where it is,
// unchanged; this only replaces the "then what" — a fake setTimeout with
// no trace — with a real, persisted, queryable record of the attempt.
//
// Deliberately its own queue, not folded into OutboundResultQueueEntry —
// this represents a genuinely different real event (a synoptic instance
// being synced TO an external LIS that owns the report, assist mode
// only) from ORU^R01 (a finalized PathScribe-owned result being made
// available FOR an interface engine to format, orchestrator mode only).
// See services/patients/README.md's own account of that real
// reportingMode boundary.
// ─────────────────────────────────────────────────────────────────────────────

export type LisSyncKind = 'corrected' | 'new_instance' | 'corrected_with_addition';

export interface OutboundLisSyncQueueEntry {
  /** Real UUID — the external "TransactionID" a downstream LIS dedupes
   *  against, same real reasoning as every other real outbound queue
   *  entry in this app. */
  id: string;
  caseId: string;
  instanceId: string;
  kind: LisSyncKind;
  organisationId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  /** Real, per direct follow-up ("We are logging interface errors
   *  with human readable error messaging?"): 'DISPATCH_UNREACHABLE'
   *  is new — see OutboundPatientAdtQueueEntry.ts's own, fuller doc
   *  comment on this same field for the full real distinction from
   *  'DISPATCH_REJECTED'. */
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}

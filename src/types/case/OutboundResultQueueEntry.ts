// src/types/case/OutboundResultQueueEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("we trigger the json packages and the
// interface engine generates the formatted messages" / "definitely
// look at results") and the attached Pathology HL7 Outbound Feature
// Spec's own Core Outbound Transaction Registry (ORU^R01): the real
// outbound queue for finalized/corrected/addendum pathology results.
//
// Scoped deliberately to reportingMode === 'orchestrator' cases only.
// ReportingMode's own doc comment (types/case/Case.ts) is explicit:
// 'assist' means "LIS owns the report, PathScribe is read-only on
// lifecycle... never CaseStatus." For an assist-mode case, PathScribe
// is not the authoritative source of the finalized report — an
// external LIS is — so PathScribe emitting its own ORU^R01 for one
// would duplicate or preempt whatever the real LIS itself sends.
// Assist mode already has its own, separate (if currently only
// simulated) outbound mechanism — sendSynopticReportToLis()
// (pages/SynopticReportPage/hooks/useLisIntegration.ts) — deliberately
// left alone here, not folded into this queue.
//
// Mirrors OutboundChargeQueueEntry/OutboundPatientAdtQueueEntry's own
// proven architecture exactly: a lightweight reference + dedup key +
// status tracker, never a pre-built payload — the actual enriched JSON
// package is built lazily, at real dispatch time, by
// buildOruR01Payload.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per the source spec's own Field State Mapping Matrix
 *  (§2.1) — maps directly onto SynopticReportInstance's own real
 *  status/pendingAmendmentId shape (types/case/Case.ts):
 *   'FINAL'     — status: 'finalized', no pendingAmendmentId, first
 *                 real version (OBR-25/OBX-11 = F).
 *   'CORRECTED' — a real amendment being released on an
 *                 already-finalized instance (OBR-25/OBX-11 = C).
 *   'ADDENDUM'  — a new, additional real instance finalized on a case
 *                 that already has at least one prior finalized
 *                 result (OBR-25/OBX-11 = A/F). */
export type OruResultState = 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'ADDENDUM';

export interface OutboundResultQueueEntry {
  /** Real UUID — the external "TransactionID" a downstream interface
   *  engine dedupes against, same real reasoning as
   *  OutboundChargeQueueEntry.id. */
  id: string;
  caseId: string;
  /** The specific SynopticReportInstance this result represents —
   *  real reference, not a duplicated payload. */
  instanceId: string;
  resultState: OruResultState;
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

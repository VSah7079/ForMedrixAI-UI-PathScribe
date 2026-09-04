// src/types/case/CytologyOutboundResultQueueEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "we trigger the json packages and the
// interface engine generates the formatted messages" — cytology's own
// version of OutboundResultQueueEntry.ts, mirroring its real,
// established shape exactly, with one real, deliberate difference:
// `signOutRecordId` (a real CytologySignOutRecord.id) in place of
// `instanceId` (a SynopticReportInstance.id) — cytology has no
// synoptic instances; a real CytologySignOutRecord is the equivalent
// "one finalized real result" unit here.
//
// Scoped, same as the surgical queue, to reportingMode: 'orchestrator'
// cases only — see resolveCytologyStructuredWorkflowAccess.ts
// (services/cytology/) for the real, shared reasoning: an assist-mode
// case means an external LIS owns the report, so this queue (and the
// structured cytology workflow that feeds it) is never the operative
// path for one.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyOutboundResultQueueEntry {
  id: string;
  caseId: string;
  /** The real CytologySignOutRecord this result represents. */
  signOutRecordId: string;
  resultState: 'FINAL';
  organisationId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}

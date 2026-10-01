// src/services/cytology/resolveCytologyStructuredWorkflowAccess.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Orchestration mode is the gate to access
// our cytology structured workflow." Neither CAP nor RCPath requires
// or expects synoptic reporting for routine GYN Pap cases — they fall
// under the Bethesda System, not a CAP Synoptic Cancer Protocol — so a
// GYN Pap case has no real reason to be reportingMode: 'assist' (an
// external LIS owning the report). Non-GYN cytology cases that DO
// warrant synoptic reporting are expected to follow the existing
// surgical pathway instead — this module's own structured workflow
// (CytologyReviewRecord, the screening page, Sign Out) is real, per
// this same guidance, gated to 'orchestrator' mode specifically: an
// assist-mode case means an external LIS owns the report, and
// PathScribe's own cytology review/sign-out would duplicate or
// preempt whatever that LIS itself sends — the exact same real
// reasoning OutboundResultQueueEntry.ts already established for why
// its own outbound ORU^R01 queue is scoped to orchestrator mode only.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveCytologyStructuredWorkflowAccess(reportingMode: string | undefined): boolean {
  return reportingMode === 'orchestrator';
}

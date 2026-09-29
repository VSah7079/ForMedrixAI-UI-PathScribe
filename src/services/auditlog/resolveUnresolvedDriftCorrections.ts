// src/services/auditlog/resolveUnresolvedDriftCorrections.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// DriftCorrectionTab.tsx's "unresolved" list — the actionable set of
// post-finalization drift corrections that are still sitting wrong
// right now — was computed directly inline, with no backing service
// and no tests. Patient-safety-relevant: a subtle bug in this
// correlation rule (matching a Deferred/Failed correction attempt to
// a LATER, same-case Auto-Corrected retry) could hide a finalized
// report that still contains an uncorrected post-signout diagnostic
// edit, or conversely flag an already-resolved case as still needing
// review. Extracted here, with real test coverage, rather than left
// as an untested inline `.filter()`.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuditLog } from './IAuditService';

/** The four real event names SynopticReportPage.tsx's own drift-
 *  correction effect writes into the audit log, and the only ones
 *  this module (and DriftCorrectionTab.tsx) ever reasons about. */
export const DRIFT_EVENTS = [
  'Post-Finalization Drift Detected',
  'Post-Finalization Drift Auto-Corrected',
  'Post-Finalization Drift Correction Deferred',
  'Post-Finalization Drift Correction Failed',
] as const;

export type DriftEvent = typeof DRIFT_EVENTS[number];

/**
 * The real "still needs review" correlation rule: a Deferred or Failed
 * correction attempt for a case counts as UNRESOLVED unless a LATER
 * Auto-Corrected event exists for that same case (a later successful
 * retry). Deliberately keyed on the log's own real `caseId` + string-
 * comparable `timestamp` — never assumes array order reflects time,
 * since `logs` may arrive from the audit service in any order.
 *
 * Returns the unresolved entries only, newest first — the same real
 * shape DriftCorrectionTab.tsx's own actionable list renders.
 */
export function resolveUnresolvedDriftCorrections(logs: AuditLog[]): AuditLog[] {
  const corrected = logs.filter(l => l.event === 'Post-Finalization Drift Auto-Corrected');
  const deferredOrFailed = logs.filter(l =>
    l.event === 'Post-Finalization Drift Correction Deferred' || l.event === 'Post-Finalization Drift Correction Failed'
  );

  const hasLaterCorrectionForCase = (caseId: string, afterTs: string) =>
    corrected.some(c => c.caseId === caseId && c.timestamp > afterTs);

  return deferredOrFailed
    .filter(l => l.caseId && !hasLaterCorrectionForCase(l.caseId, l.timestamp))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// src/pages/SynopticReportPage/hooks/sharedHookTypes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared types and small helpers used across multiple SynopticReportPage
// hooks. Added during a review pass after the initial extraction — several
// of the seven hooks had independently re-declared identical types
// (SigningUser, the setConcurrencyConflict signature,
// sendSynopticReportToLis, generateReportPdfSnapshot), which is exactly
// the kind of drift risk a "pure move" extraction can leave behind: five
// copies of the same type are five places a future change could apply to
// only some of them.
// ─────────────────────────────────────────────────────────────────────────────

import { useAuth } from '@/contexts/AuthContext';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
import { mockAuditService } from '@/services/auditlog/mockAuditService';

export type SigningUser = ReturnType<typeof useAuth>['user'];

export type ConcurrencyConflictState = { actualVersion: number; blockOverride?: boolean } | null;
export type SetConcurrencyConflict = (conflict: ConcurrencyConflictState) => void;

export type SendSynopticReportToLisPayload = {
  kind: 'corrected' | 'new_instance' | 'corrected_with_addition';
  caseId: string;
  instanceId: string;
  reasonForChange?: string; // only meaningful for 'corrected'
  sequenceNumber?: number; // addendum numbering, for the header label
  addendumTitle?: string;
  /** The actual discrete text block being handed to the LIS — the
   *  embedded header gets prepended to this, not just attached as
   *  separate metadata. */
  payloadBody: string;
};
export type SendSynopticReportToLisFn = (payload: SendSynopticReportToLisPayload) => Promise<{ ok: boolean }>;
export type GenerateReportPdfSnapshotFn = () => Promise<{ pdfBase64?: string; generationError?: string }>;

// ── Shared conflict handling ────────────────────────────────────────────────
// Every hook's write path follows the same shape: try the write, and on
// ConcurrencyConflictError specifically, surface the conflict modal via
// setConcurrencyConflict rather than treating it as a generic failure.
// That check-and-surface step was identical in all 14 call sites across
// five hooks; what genuinely differs per call site is (a) whether this
// particular write is high-stakes enough to force blockOverride (finalize,
// sign-out, amendment release — no "proceed anyway" option) versus a
// routine draft edit that allows one, and (b) what the calling function
// itself needs to do next (some just `return`, one returns `false` since
// its own signature is Promise<boolean>). Rather than force every caller
// into an identical shape, this returns a boolean — true if the error was
// a conflict and has been surfaced, false otherwise — so each call site
// keeps its own return statement and blockOverride choice explicit at the
// call site, not hidden inside a shared function's default.
//
// Real, direct follow-up (PS-71): a real conflict was detected and shown to
// the user, but never written to the audit trail — zero references to
// ConcurrencyConflictError existed anywhere in services/auditlog/ before
// this. Logged right here, in this one shared choke point, so every real
// call site across all six hooks that already route through this function
// gets audit coverage with no per-call-site change required. `userName`/
// `actionName` are optional, additive context (same honest-when-absent
// convention already established for AuditLog's own facilityId/stationId
// fields) — callers that don't pass them still get a real audit entry, just
// without per-user attribution, rather than silently getting no entry at
// all. Known gap, not fixed here: SynopticReportPage.tsx's own 14 inline
// ConcurrencyConflictError catch sites don't call this shared helper at all
// (a separate, pre-existing duplication issue, not part of this ticket) —
// only the six real hooks' conflicts are covered by this.
export function handleConcurrencyConflict(
  e: unknown,
  setConcurrencyConflict: SetConcurrencyConflict,
  options?: { blockOverride?: boolean; userName?: string; actionName?: string },
): boolean {
  if (e instanceof ConcurrencyConflictError) {
    setConcurrencyConflict({ actualVersion: e.actualVersion, blockOverride: options?.blockOverride });
    mockAuditService.logEvent({
      type: 'system',
      event: 'Concurrency conflict detected',
      detail: `${options?.actionName ?? 'save'}: expected version ${e.expectedVersion}, found ${e.actualVersion} — ${options?.blockOverride ? 'blocked, no override offered' : 'shown to user, override available'}`,
      user: options?.userName ?? 'unknown',
      caseId: e.caseId,
      confidence: null,
    }).catch(() => {});
    return true;
  }
  return false;
}

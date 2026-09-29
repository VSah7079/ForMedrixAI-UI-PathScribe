// src/services/intraopDashboard/resolveDismissalTatMetrics.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// OrSuiteDashboardPage.tsx's own DismissConfirmationModal computed
// dwell-time/TAT math inline from raw timestamps right before logging
// the dismissal event — even though this same file already documents
// extracting equivalent elapsed-time logic to
// resolveOrBoardRowDisplayState.ts/resolveIntraopTatStatus.ts "per
// direct guidance (no business logic in the UI unless compulsory)".
// This one calculation was missed. Extracted here, unchanged behavior,
// alongside this directory's own established resolve*.ts convention.
// ─────────────────────────────────────────────────────────────────────────────

import type { ActiveIntraopRequest } from './resolveActiveIntraopRequestsForLocations';

export interface DismissalTatMetrics {
  /** Real time on the OR Live Board from frozen-section sign-off to
   *  dismissal — undefined when the case is dismissed with no
   *  sign-off ever recorded (frozenDiagnosisRenderedAt unset), same
   *  as the pre-existing behavior this replaces. */
  dwellTimeOnBoardSeconds: number | undefined;
  /** Real total turnaround, arrival → sign-off — same undefined-when-
   *  no-sign-off behavior as dwellTimeOnBoardSeconds above. */
  totalTurnaroundMinutes: number | undefined;
}

/**
 * Real dismissal-time TAT metrics for the OR event log — dwell time on
 * the board since sign-off, and total case turnaround since arrival.
 * `dismissedAtMs` defaults to the real current time (real, deliberate
 * `Date.now()` call at dismissal, not a passed-in "now" tick — this
 * fires exactly once, at the moment of a real staff action, never on a
 * shared render-loop tick like the row-display clock does).
 */
export function resolveDismissalTatMetrics(
  request: Pick<ActiveIntraopRequest, 'frozenDiagnosisRenderedAt' | 'arrivalTimestamp'>,
  dismissedAtMs: number = Date.now(),
): DismissalTatMetrics {
  if (!request.frozenDiagnosisRenderedAt) {
    return { dwellTimeOnBoardSeconds: undefined, totalTurnaroundMinutes: undefined };
  }
  const signOffMs = new Date(request.frozenDiagnosisRenderedAt).getTime();
  const dwellTimeOnBoardSeconds = Math.max(0, Math.round((dismissedAtMs - signOffMs) / 1000));
  const totalTurnaroundMinutes = Math.round((signOffMs - new Date(request.arrivalTimestamp).getTime()) / 60000);
  return { dwellTimeOnBoardSeconds, totalTurnaroundMinutes };
}

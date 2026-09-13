// src/services/intraopDashboard/resolveIntraopTatStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section
// Dashboard's own "Stat Alert Escalation... standard 20-minute
// turnaround from tissue arrival to preliminary verbal report."
// Mirrors services/batches/DecalBatch.ts's own real, proven
// getDecalTimerState() pattern exactly — a pure, client-side function
// computing elapsed time from an absolute timestamp, re-rendered
// periodically by the caller (same real setInterval-ticks-a-counter
// mechanism BatchDetailView.tsx already uses), never a server-pushed
// tick. See this module's own README for the fuller reasoning
// (resilience through a dropped connection; the tick itself needs no
// network at all).
// ─────────────────────────────────────────────────────────────────────────────

export type IntraopTatStatus = 'normal' | 'warning' | 'overdue';

export interface IntraopTatResult {
  status: IntraopTatStatus;
  elapsedMinutes: number;
  remainingMinutes: number;
}

/** Real, per the RFP's own stated example — the default target and a
 *  real, proportional warning window (25% of target, same real ratio
 *  DecalBatch.ts's own 15-of-typically-60+ minutes uses), not an
 *  arbitrary number. Both are real, admin-overridable parameters —
 *  the RFP's own "e.g." wording confirms 20 minutes is an example,
 *  not a universal constant every real site must use. */
export const DEFAULT_INTRAOP_TARGET_MINUTES = 20;
export const DEFAULT_INTRAOP_WARNING_MINUTES_BEFORE_TARGET = 5;

export function resolveIntraopTatStatus(
  tissueArrivedAt: string,
  targetMinutes: number = DEFAULT_INTRAOP_TARGET_MINUTES,
  warningMinutesBefore: number = DEFAULT_INTRAOP_WARNING_MINUTES_BEFORE_TARGET,
  now: Date = new Date(),
): IntraopTatResult {
  const elapsedMs = now.getTime() - new Date(tissueArrivedAt).getTime();
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
  const remainingMinutes = targetMinutes - elapsedMinutes;
  const status: IntraopTatStatus =
    remainingMinutes <= 0 ? 'overdue'
    : remainingMinutes <= warningMinutesBefore ? 'warning'
    : 'normal';
  return { status, elapsedMinutes, remainingMinutes };
}

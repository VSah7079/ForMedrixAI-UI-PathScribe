// src/services/facilityOpsDashboard/computeSlaCountdown.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, direct generalization of DecalBatch.ts's own getDecalTimerState
// — same real math (elapsed/remaining minutes, warning threshold
// before target, overdue once remaining hits zero), lifted out of
// that decal-specific file so every dashboard view can share one real
// countdown implementation instead of five independently-reinvented
// copies. DecalBatch.ts itself is untouched — its own
// getDecalTimerState/DecalTimerState stay the real, single source for
// decal batches specifically (and this file's own decal callers keep
// using it directly, never a parallel duplicate for that one case).
// ─────────────────────────────────────────────────────────────────────────────

import type { SlaState } from './IFacilityOpsDashboardTypes';

export interface SlaCountdown {
  state: SlaState;
  elapsedMinutes: number;
  remainingMinutes: number;
}

/** Real, honest default — per direct guidance, a countdown badge only
 *  ever renders once a real target duration was actually resolved
 *  (see this module's own callers); this constant just sets how many
 *  minutes before that real target counts as "warning" rather than
 *  "normal," mirroring DecalBatch.ts's own DECAL_WARNING_MINUTES_BEFORE_TARGET. */
export const SLA_WARNING_MINUTES_BEFORE_TARGET = 30;

export function computeSlaCountdown(
  startedAt: string,
  targetMinutes: number,
  warningMinutesBeforeTarget: number = SLA_WARNING_MINUTES_BEFORE_TARGET
): SlaCountdown {
  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
  const remainingMinutes = targetMinutes - elapsedMinutes;
  const state: SlaState =
    remainingMinutes <= 0 ? 'overdue'
    : remainingMinutes <= warningMinutesBeforeTarget ? 'warning'
    : 'normal';
  return { state, elapsedMinutes, remainingMinutes };
}

/** Same real "Xh Ym" formatting as DecalBatch.ts's own
 *  formatDecalDuration, generalized alongside the math above. */
export function formatSlaDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

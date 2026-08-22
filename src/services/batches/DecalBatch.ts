// src/services/batches/DecalBatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "Decal / Special
// Processing Batch Attributes." Fields only meaningful when a real
// Batch's own processingNode === 'Decal / Special Processing' — see
// IBatchService.ts's own header for why this replaced 'Grossing' in
// the batch-container taxonomy.
// ─────────────────────────────────────────────────────────────────────────────

export type DecalSolutionType = 'EDTA' | 'Rapid Decal (Formic/HCl)' | '10% NBF (Fixation Window)';

export const DECAL_SOLUTION_TYPES: DecalSolutionType[] = [
  'EDTA', 'Rapid Decal (Formic/HCl)', '10% NBF (Fixation Window)',
];

export type DecalTimerStatus = 'normal' | 'warning' | 'overdue';

export interface DecalTimerState {
  status: DecalTimerStatus;
  elapsedMinutes: number;
  remainingMinutes: number;
}

/** Real, deliberate default — per the spec's own worked example
 *  ("Timer set for 4 hours — Warning alert at 3h 45m"): exactly 15
 *  minutes before the real target duration. Not a separately
 *  configurable field — the spec gives one real, concrete example, not
 *  a range, and a fixed default keeps this simple and predictable
 *  rather than introducing a second, unrequested "how early should
 *  the warning fire" setting nobody asked for. */
export const DECAL_WARNING_MINUTES_BEFORE_TARGET = 15;

/** Real, single point of calculation — the spec's own "Start
 *  Timestamp: Auto-logged upon batch creation" IS Batch.createdAt
 *  (batch creation and the decal clock starting are the same real
 *  event for this workflow) — not a second, redundant field that
 *  could drift from it. */
export function getDecalTimerState(createdAt: string, targetDurationMinutes: number): DecalTimerState {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
  const remainingMinutes = targetDurationMinutes - elapsedMinutes;
  const status: DecalTimerStatus =
    remainingMinutes <= 0 ? 'overdue'
    : remainingMinutes <= DECAL_WARNING_MINUTES_BEFORE_TARGET ? 'warning'
    : 'normal';
  return { status, elapsedMinutes, remainingMinutes };
}

/** Real, human-readable "Xh Ym" formatting — matches the spec's own
 *  worked example wording ("4 hours", "3h 45m") rather than raw
 *  minutes or a decimal-hours figure. Negative input (an overdue
 *  amount) is formatted the same way on its absolute value — the
 *  caller decides whether to prefix it (e.g. "Overdue by") based on
 *  DecalTimerStatus, this function only ever renders a duration.
 */
export function formatDecalDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

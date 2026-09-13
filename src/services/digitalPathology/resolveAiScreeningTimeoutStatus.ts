// src/services/digitalPathology/resolveAiScreeningTimeoutStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own earlier DP/AI vendor research plan. A
// pure, testable function identifying real, ordered AI screenings that
// have genuinely exceeded a reasonable turnaround window and should be
// surfaced to a real user/queue as likely stalled — this app itself
// never silently marks these timed_out; that's the real interface
// engine's own job (or a real, later scheduled sweep this function
// could drive), same "PathScribe computes; a real process acts on it"
// split as every other resolver in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';

const DEFAULT_TIMEOUT_HOURS = 24;

export function resolveAiScreeningTimeoutStatus(
  results: AiScreeningResult[],
  now: Date = new Date(),
  timeoutHours: number = DEFAULT_TIMEOUT_HOURS,
): AiScreeningResult[] {
  const thresholdMs = timeoutHours * 60 * 60 * 1000;
  return results.filter(r => {
    if (r.status !== 'ordered') return false;
    const orderedAtMs = new Date(r.orderedAt).getTime();
    return now.getTime() - orderedAtMs >= thresholdMs;
  });
}

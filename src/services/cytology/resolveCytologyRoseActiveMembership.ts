// src/services/cytology/resolveCytologyRoseActiveMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Step 4 ask: "ROSE / Bedside
// Evaluations Queue: Active/recent Rapid On-Site Evaluation
// tracking." Same real "pool membership" shape this app's own
// established pattern already uses. Real, deliberate scope: "recent"
// is the one, real, simply-available signal (performedAt within a
// real time window) — a real "still awaiting final lab confirmation"
// signal would need cross-referencing this specimen's own review
// records for a real final adequacy call, which is real, separate,
// more involved work than this specific worklist-visibility question
// needs to justify right now.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyRoseEvaluation } from '@/types/cytology/CytologyRoseEvaluation';

const DEFAULT_RECENT_WINDOW_HOURS = 48;

export function resolveCytologyRoseActiveMembership(
  roseEvaluations: CytologyRoseEvaluation[] | undefined,
  asOfDate: Date = new Date(),
  recentWindowHours = DEFAULT_RECENT_WINDOW_HOURS,
): boolean {
  if (!roseEvaluations || roseEvaluations.length === 0) return false;
  const cutoff = new Date(asOfDate.getTime() - recentWindowHours * 60 * 60 * 1000);
  return roseEvaluations.some(evaluation => new Date(evaluation.performedAt) >= cutoff);
}

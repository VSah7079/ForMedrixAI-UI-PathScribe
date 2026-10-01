// src/services/cases/fppeEndCondition.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep: the
// FPPE end-condition threshold math (case-count / duration-days / either,
// "either" meaning whichever threshold is hit first) used to be computed
// three separate times — mockFppeAssignmentService.ts's own endConditionMet()/
// completionReason() (the real enforcement logic, which auto-transitions an
// assignment to 'completed'), FppeAssignmentsSection.tsx's endConditionLabel()
// (the admin progress-text display), and FppeTrackingTab.tsx's
// progressPercent() (the tracking-tab progress bar and overdue-highlight
// logic). All three happened to agree, but nothing enforced that — a future
// change to the threshold policy was likely to be applied to the real
// enforcement logic and missed in one or both displays. This module is now
// the one real source of truth all three call.
// ─────────────────────────────────────────────────────────────────────────────

import type { FppeAssignment } from '@/types/case/FppeAssignment';

export interface FppeProgress {
  /** Days elapsed since the assignment's startedAt, as a real, fractional
   *  (not floored) number of days — callers that display whole days floor
   *  it themselves, matching each display's own prior rounding behavior. */
  daysSinceStart: number;
  /** Fraction (not capped at 1) of the case-count threshold reached, or
   *  null when this assignment's end condition doesn't use one. */
  byCasesFraction: number | null;
  /** Fraction (not capped at 1) of the duration threshold reached, or
   *  null when this assignment's end condition doesn't use one. */
  byDurationFraction: number | null;
  /** The applicable fraction — for 'either' conditions, the larger of the
   *  two (matching the pre-existing "whichever gets there first" progress
   *  display); for a single-condition assignment, that condition's own
   *  fraction. Not capped at 1 — callers that display a percentage cap it
   *  themselves (Math.min(100, fraction * 100)). */
  fraction: number;
  /** True once the assignment's end condition has actually been met —
   *  the same real check used to auto-transition an assignment to
   *  'completed'. */
  met: boolean;
}

export function computeFppeProgress(a: FppeAssignment): FppeProgress {
  const daysSinceStart = (Date.now() - new Date(a.startedAt).getTime()) / 86400000;

  if (a.endCondition.type === 'case_count') {
    const byCasesFraction = a.casesReviewedCount / a.endCondition.threshold;
    return { daysSinceStart, byCasesFraction, byDurationFraction: null, fraction: byCasesFraction, met: byCasesFraction >= 1 };
  }
  if (a.endCondition.type === 'duration_days') {
    const byDurationFraction = daysSinceStart / a.endCondition.threshold;
    return { daysSinceStart, byCasesFraction: null, byDurationFraction, fraction: byDurationFraction, met: byDurationFraction >= 1 };
  }

  const byCasesFraction = a.casesReviewedCount / a.endCondition.caseCountThreshold;
  const byDurationFraction = daysSinceStart / a.endCondition.durationDaysThreshold;
  const fraction = Math.max(byCasesFraction, byDurationFraction);
  return { daysSinceStart, byCasesFraction, byDurationFraction, fraction, met: fraction >= 1 };
}

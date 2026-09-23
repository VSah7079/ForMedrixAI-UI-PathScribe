// src/services/quality/resolveQaActivitySelectionForCase.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-117. The real, generic QA Activity Engine case-selection logic —
// "does this case need review, for which activities, and why" —
// checked once per case against every active QaActivityType. This is
// the real mechanism QaActivityType.ts's own samplingPercentage/
// targetedSelectionRule doc comments describe as deliberately not
// built there ("the Activity Engine's own job, a separate ticket").
//
// Real, deliberate reuse of shouldRandomlySampleForCodeReview.ts's own
// proven convention for the random half — genuinely random
// (Math.random()), not a hash-based pseudo-random selection, same
// real reasoning: an honest sample, not one that makes the same case
// always land the same way every time it's checked. Confirmed this
// pattern is the right one to mirror here too (not just superficially
// similar) before reusing it — a review-sampling rate has the exact
// same "true random sample, not a deterministic pseudo-random one"
// requirement billing's own code-review sampling already established.
//
// Targeted selection always wins over random — a targeted match is a
// certain, rule-based "this case needs review," not a probabilistic
// one; there's nothing for the random roll to add once that's already
// true. A case can still be selected by BOTH a targeted rule on one
// activity and a random roll on another independent activity in the
// same call - each active QaActivityType is evaluated independently,
// matching the real fact that a case may need review for more than
// one distinct real reason at once.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { QaCaseSelectionContext } from './resolveQaCaseSelectionContext';
import { evaluateQaTargetedSelectionRule } from './evaluateQaTargetedSelectionRule';
import { shouldRandomlySampleForCodeReview } from '@/services/billing/shouldRandomlySampleForCodeReview';

export interface QaActivitySelectionResult {
  activityTypeId: string;
  /** Real, per direct guidance: why this activity flagged the case —
   *  'targeted' when its targetedSelectionRule matched, 'random' when
   *  only the samplingPercentage roll hit. Surfaced so a real review
   *  queue can show "why is this case here," not just that it is. */
  reason: 'targeted' | 'random';
}

/**
 * Real, per direct guidance (PS-117): evaluates every active
 * QaActivityType against one case's real, pre-computed selection
 * context, returning which activities flag this case for review and
 * why. Inactive activity types are never evaluated — deactivating an
 * activity (the real, existing deactivate() action) already means "no
 * new selection," matching that action's own real intent.
 */
export function resolveQaActivitySelectionForCase(
  context: QaCaseSelectionContext,
  activityTypes: QaActivityType[],
): QaActivitySelectionResult[] {
  const results: QaActivitySelectionResult[] = [];

  for (const activityType of activityTypes) {
    if (!activityType.active) continue;

    if (evaluateQaTargetedSelectionRule(activityType.targetedSelectionRule, context)) {
      results.push({ activityTypeId: activityType.id, reason: 'targeted' });
      continue;
    }

    // Real, deliberate reuse — not a second, parallel sampling concept
    // — same real function QaActivityType.samplingPercentage's own doc
    // comment names as the convention this mirrors. Its billing-
    // flavored name is a naming artifact of where it was built first,
    // not a sign it's billing-specific: the algorithm itself (roll a
    // genuine Math.random() against a percentage) has no billing
    // concept in it at all.
    if (shouldRandomlySampleForCodeReview(activityType.samplingPercentage)) {
      results.push({ activityTypeId: activityType.id, reason: 'random' });
    }
  }

  return results;
}

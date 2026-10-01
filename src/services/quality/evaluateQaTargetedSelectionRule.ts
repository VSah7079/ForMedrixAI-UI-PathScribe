// src/services/quality/evaluateQaTargetedSelectionRule.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-117. The real evaluator for a QaActivityType's own
// targetedSelectionRule against one case's real, pre-computed
// QaCaseSelectionContext. Deliberately trivial — the rule shape itself
// is a single named-signal lookup, not a boolean expression tree — see
// QaTargetedSelectionRule's own doc comment for why that's a real,
// deliberate scoping decision, not an unfinished one.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaTargetedSelectionRule } from '@/types/quality/QaActivityType';
import type { QaCaseSelectionContext } from './resolveQaCaseSelectionContext';

/** Real, per direct guidance (PS-117): undefined rule never matches —
 *  an activity with no targeted rule configured relies entirely on
 *  samplingPercentage (or fully manual selection), matching this
 *  file's own "absence means off" convention throughout QaActivityType. */
export function evaluateQaTargetedSelectionRule(
  rule: QaTargetedSelectionRule | undefined,
  context: QaCaseSelectionContext,
): boolean {
  if (!rule) return false;
  return context[rule.signal] === true;
}

// src/services/cytologyQc/resolveQcRuleEvaluation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per spec §2.2's own Trigger Event and Assignment Routing —
// "the engine evaluates the case against active QC rules in order of
// defined rule priority." First genuinely matching AND selected rule
// wins; a case is never counted against two rules at once. Pure —
// composes resolveQcCriteriaMatch.ts and resolveQcSamplingDecision.ts,
// owns no state or randomness of its own.
//
// Real, per spec §2.2's own Consultation Deduplication guardrail —
// checked once, up front, before any rule is evaluated at all: "Cases
// already routed through formal intradepartmental consultation are
// automatically excluded from random QC sampling."
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyQcRule, QcPeerReviewPriorityTier } from '@/types/cytologyQc/CytologyQcRule';
import { resolveQcCriteriaMatch, type QcEvaluationCaseContext } from './resolveQcCriteriaMatch';
import { resolveQcSamplingDecision, type QcSamplingState, INITIAL_QC_SAMPLING_STATE } from './resolveQcSamplingDecision';

export type QcEvaluationResult =
  | { matched: true; ruleId: string; priorityTier: QcPeerReviewPriorityTier; slaHours: number; updatedSamplingStates: Map<string, QcSamplingState> }
  | { matched: false; updatedSamplingStates: Map<string, QcSamplingState> };

export function resolveQcRuleEvaluation(
  context: QcEvaluationCaseContext,
  isAlreadyInFormalConsultation: boolean,
  rules: CytologyQcRule[],
  samplingStatesByRuleId: Map<string, QcSamplingState>,
  randomRoll: number,
): QcEvaluationResult {
  const updatedStates = new Map(samplingStatesByRuleId);

  if (isAlreadyInFormalConsultation) {
    return { matched: false, updatedSamplingStates: updatedStates };
  }

  const sortedActiveRules = rules
    .filter(r => r.active)
    .sort((a, b) => b.evaluationPriority - a.evaluationPriority);

  for (const rule of sortedActiveRules) {
    if (!resolveQcCriteriaMatch(rule.criteria, context)) continue;

    const currentState = updatedStates.get(rule.id) ?? INITIAL_QC_SAMPLING_STATE;
    const { selected, updatedState } = resolveQcSamplingDecision(rule.samplingLogic, currentState, randomRoll);
    updatedStates.set(rule.id, updatedState);

    if (selected) {
      return {
        matched: true,
        ruleId: rule.id,
        priorityTier: rule.peerReviewPriorityTier,
        slaHours: rule.slaHours,
        updatedSamplingStates: updatedStates,
      };
    }
    // Real, per spec's own "in order of priority" — a rule that
    // matched criteria but wasn't selected by its own sampling logic
    // never blocks evaluation of the next rule in priority order.
  }

  return { matched: false, updatedSamplingStates: updatedStates };
}

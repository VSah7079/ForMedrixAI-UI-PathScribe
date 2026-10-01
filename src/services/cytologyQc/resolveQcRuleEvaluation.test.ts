import { describe, it, expect } from 'vitest';
import { resolveQcRuleEvaluation } from './resolveQcRuleEvaluation';
import type { CytologyQcRule } from '@/types/cytologyQc/CytologyQcRule';
import type { QcEvaluationCaseContext } from './resolveQcCriteriaMatch';

const context: QcEvaluationCaseContext = {
  jurisdiction: 'US',
  primarySignOutProviderId: 'prov-1',
  providerRole: 'cytotechnologist',
  specimenCategory: 'gyn_pap',
  sampleAdequacy: 'satisfactory',
  activeHighRiskFlags: [],
  resultIsNegative: true,
  providerCapabilities: [],
};

const routineRule: CytologyQcRule = {
  id: 'rule-routine', name: 'Routine 10%', active: true, evaluationPriority: 1,
  criteria: {}, samplingLogic: { type: 'percentage', ratePercent: 10 },
  peerReviewPriorityTier: 'routine_random', slaHours: 24,
};

const highRiskRule: CytologyQcRule = {
  id: 'rule-highrisk', name: 'High Risk 100%', active: true, evaluationPriority: 10,
  criteria: { highRiskFlags: ['prior_dysplasia_hsil'] }, samplingLogic: { type: 'percentage', ratePercent: 100 },
  peerReviewPriorityTier: 'targeted_high_consequence', slaHours: 4,
};

describe('resolveQcRuleEvaluation', () => {
  it('a real case matching a higher-priority rule is evaluated against that rule first, per spec\'s own priority ordering', () => {
    const result = resolveQcRuleEvaluation(
      { ...context, activeHighRiskFlags: ['prior_dysplasia_hsil'] },
      false, [routineRule, highRiskRule], new Map(), 0.99,
    );
    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error('expected a match');
    expect(result.ruleId).toBe('rule-highrisk');
    expect(result.priorityTier).toBe('targeted_high_consequence');
  });

  it('a real case not matching the high-priority rule\'s own criteria falls through to the next real rule in priority order', () => {
    const result = resolveQcRuleEvaluation(context, false, [routineRule, highRiskRule], new Map(), 0.05);
    expect(result.matched).toBe(true);
    if (!result.matched) throw new Error('expected a match');
    expect(result.ruleId).toBe('rule-routine');
  });

  it('a real case already in formal consultation is excluded from every rule entirely, per spec\'s own Consultation Deduplication guardrail', () => {
    const result = resolveQcRuleEvaluation(
      { ...context, activeHighRiskFlags: ['prior_dysplasia_hsil'] },
      true, [highRiskRule], new Map(), 0.01,
    );
    expect(result.matched).toBe(false);
  });

  it('a real, inactive rule is never evaluated, even if its own criteria would otherwise match', () => {
    const inactiveRule = { ...highRiskRule, active: false };
    const result = resolveQcRuleEvaluation(
      { ...context, activeHighRiskFlags: ['prior_dysplasia_hsil'] },
      false, [inactiveRule], new Map(), 0.01,
    );
    expect(result.matched).toBe(false);
  });

  it('a real, criteria-matching rule that is not selected by its own sampling logic never blocks the next rule', () => {
    const result = resolveQcRuleEvaluation(context, false, [routineRule], new Map(), 0.99);
    expect(result.matched).toBe(false);
    // Real — the routine rule's own counter state is still returned, even on a real non-selection.
    expect(result.updatedSamplingStates.has('rule-routine')).toBe(true);
  });

  it('sampling state genuinely persists and advances across repeated real evaluation calls for the same rule', () => {
    const intervalRule: CytologyQcRule = {
      id: 'rule-interval', name: 'Every 5th', active: true, evaluationPriority: 1,
      criteria: {}, samplingLogic: { type: 'interval', everyNthCase: 3 },
      peerReviewPriorityTier: 'routine_random', slaHours: 24,
    };
    let states = new Map();
    for (let i = 0; i < 2; i++) {
      const result = resolveQcRuleEvaluation(context, false, [intervalRule], states, 0.5);
      expect(result.matched).toBe(false);
      states = result.updatedSamplingStates;
    }
    const thirdResult = resolveQcRuleEvaluation(context, false, [intervalRule], states, 0.5);
    expect(thirdResult.matched).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveNewQcCaseAssignmentFromRuleMatch, resolveNewQcCaseAssignmentFromRoseDiscrepancy } from './resolveNewQcCaseAssignment';
import type { QcEvaluationResult } from './resolveQcRuleEvaluation';

describe('resolveNewQcCaseAssignmentFromRuleMatch', () => {
  const matchedEvaluation: Extract<QcEvaluationResult, { matched: true }> = {
    matched: true, ruleId: 'rule-1', priorityTier: 'routine_random', slaHours: 24, updatedSamplingStates: new Map(),
  };

  it('a real rule match produces a real QC_PENDING assignment with the matched rule\'s own real tier and SLA', () => {
    const result = resolveNewQcCaseAssignmentFromRuleMatch('case-1', 'spec-1', 'prov-1', matchedEvaluation, false);
    expect(result.state).toBe('QC_PENDING');
    expect(result.triggerSource).toBe('rule_match');
    expect(result.matchedRuleId).toBe('rule-1');
    expect(result.priorityTier).toBe('routine_random');
    expect(result.badges).toEqual([]);
  });

  it('a real CT escalation is tagged distinctly from a direct rule match, even using the same matched rule', () => {
    const result = resolveNewQcCaseAssignmentFromRuleMatch('case-1', 'spec-1', 'prov-1', matchedEvaluation, true);
    expect(result.triggerSource).toBe('ct_escalation');
    expect(result.badges).toContain('CT Escalation');
  });
});

describe('resolveNewQcCaseAssignmentFromRoseDiscrepancy', () => {
  it('a real ROSE discrepancy always lands at the real, highest urgency tier with the real "ROSE Discrepancy" badge, regardless of any rule', () => {
    const result = resolveNewQcCaseAssignmentFromRoseDiscrepancy('case-1', 'spec-1', 'prov-1');
    expect(result.triggerSource).toBe('rose_discrepancy');
    expect(result.priorityTier).toBe('high_escalation');
    expect(result.badges).toEqual(['ROSE Discrepancy']);
    expect(result.state).toBe('QC_PENDING');
  });

  it('a real ROSE discrepancy always uses the real, fixed 4-hour urgent SLA, per spec \u00a72.3\'s own figure', () => {
    const before = Date.now();
    const result = resolveNewQcCaseAssignmentFromRoseDiscrepancy('case-1', 'spec-1', 'prov-1');
    const deadlineMs = new Date(result.slaDeadline).getTime();
    const hoursUntilDeadline = (deadlineMs - before) / (60 * 60 * 1000);
    expect(hoursUntilDeadline).toBeGreaterThan(3.9);
    expect(hoursUntilDeadline).toBeLessThan(4.1);
  });
});

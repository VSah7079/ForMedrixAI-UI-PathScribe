// src/services/abnormalDetection/evaluateAbnormalTriggerRules.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateAbnormalTriggerRules, highestSeverityMatch } from './evaluateAbnormalTriggerRules';
import type { AbnormalTriggerRule } from './IAbnormalTriggerRuleService';
import type { ResolvedAnswer } from '@/orchestrator/contextBuilder';

function answer(overrides: Partial<ResolvedAnswer> = {}): ResolvedAnswer {
  return { fieldId: 'f1', fieldLabel: 'Margin Status', fieldType: 'select', value: 'opt_positive', displayValue: 'Positive', ...overrides };
}

const MARGIN_RULE: AbnormalTriggerRule = {
  id: 'atr-margin-positive', fieldLabel: 'Margin Status', triggerValues: ['Positive'],
  severity: 'Critical', status: 'Active',
};

describe('evaluateAbnormalTriggerRules — the real PS-129 matching logic', () => {
  it('matches on displayValue and produces a real AiFieldSuggestion, confidence 100', () => {
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer()], [MARGIN_RULE]);
    expect(matches).toHaveLength(1);
    expect(matches[0].severity).toBe('Critical');
    expect(matches[0].suggestion).toEqual({
      value: 'Critical',
      confidence: 100,
      source: 'Margin Status: Positive',
      verification: 'unverified',
    });
  });

  it('is case-insensitive on both field label and value', () => {
    const rule: AbnormalTriggerRule = { ...MARGIN_RULE, fieldLabel: 'margin status', triggerValues: ['positive'] };
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer()], [rule]);
    expect(matches).toHaveLength(1);
  });

  it('does not match a different field label, even with the same value', () => {
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer({ fieldLabel: 'Something Else' })], [MARGIN_RULE]);
    expect(matches).toHaveLength(0);
  });

  it('does not match a non-triggering value on the correct field', () => {
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer({ value: 'opt_negative', displayValue: 'Negative' })], [MARGIN_RULE]);
    expect(matches).toHaveLength(0);
  });

  it('never matches an inactive rule', () => {
    const inactive: AbnormalTriggerRule = { ...MARGIN_RULE, status: 'Inactive' };
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer()], [inactive]);
    expect(matches).toHaveLength(0);
  });

  it('never matches a value that merely contains the trigger text as a substring (e.g. "Not Present" vs "Present")', () => {
    const rule: AbnormalTriggerRule = { ...MARGIN_RULE, fieldLabel: 'Perineural Invasion', triggerValues: ['Present'] };
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer({ fieldLabel: 'Perineural Invasion', displayValue: 'Not Present' })], [rule]);
    expect(matches).toHaveLength(0);
  });

  it('matches a multi-select field when ANY selected value is a trigger value', () => {
    const rule: AbnormalTriggerRule = { ...MARGIN_RULE, triggerValues: ['Present'] };
    const multiAnswer = answer({ fieldLabel: 'Lymphovascular Invasion', value: ['opt_a', 'opt_present'], displayValue: 'Other, Present' });
    const multiRule: AbnormalTriggerRule = { ...rule, fieldLabel: 'Lymphovascular Invasion' };
    const matches = evaluateAbnormalTriggerRules('spec-1', [multiAnswer], [multiRule]);
    expect(matches).toHaveLength(1);
  });

  it('produces one match per matching rule when multiple rules match the same specimen', () => {
    const rules: AbnormalTriggerRule[] = [
      MARGIN_RULE,
      { id: 'atr-ln', fieldLabel: 'Lymph Node Status', triggerValues: ['Positive'], severity: 'Critical', status: 'Active' },
    ];
    const answers = [answer(), answer({ fieldLabel: 'Lymph Node Status', displayValue: 'Positive' })];
    const matches = evaluateAbnormalTriggerRules('spec-1', answers, rules);
    expect(matches).toHaveLength(2);
  });

  it('produces no matches and no false positives for an empty answer set', () => {
    const matches = evaluateAbnormalTriggerRules('spec-1', [], [MARGIN_RULE]);
    expect(matches).toHaveLength(0);
  });

  it('real, per direct guidance ("we can use synthetic codes because we will not have a license"): a matched rule with its own configured synthetic coding carries it through, not the generic severity default', () => {
    const ruleWithOwnCoding: AbnormalTriggerRule = {
      ...MARGIN_RULE,
      syntheticCoding: [{ system: 'TEST-SNOMED', code: 'TEST-SNOMED-000042', display: '[SYNTHETIC — TEST ONLY] Positive margin, specific to this rule' }],
    };
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer()], [ruleWithOwnCoding]);
    expect(matches[0].syntheticCoding).toEqual([{ system: 'TEST-SNOMED', code: 'TEST-SNOMED-000042', display: '[SYNTHETIC — TEST ONLY] Positive margin, specific to this rule' }]);
  });

  it('a matched rule with no configured synthetic coding falls back to the real, severity-keyed default', () => {
    const matches = evaluateAbnormalTriggerRules('spec-1', [answer()], [MARGIN_RULE]);
    expect(matches[0].syntheticCoding.length).toBeGreaterThan(0);
    expect(matches[0].syntheticCoding[0].code).toMatch(/^TEST-/);
  });
});

describe('highestSeverityMatch', () => {
  it('returns undefined for an empty match list, never a fabricated default', () => {
    expect(highestSeverityMatch([])).toBeUndefined();
  });

  it('picks Malignant over Critical over Abnormal', () => {
    const matches = evaluateAbnormalTriggerRules('spec-1', [
      answer({ fieldLabel: 'A', displayValue: 'x' }),
      answer({ fieldLabel: 'B', displayValue: 'y' }),
      answer({ fieldLabel: 'C', displayValue: 'z' }),
    ], [
      { id: 'r1', fieldLabel: 'A', triggerValues: ['x'], severity: 'Abnormal', status: 'Active' },
      { id: 'r2', fieldLabel: 'B', triggerValues: ['y'], severity: 'Malignant', status: 'Active' },
      { id: 'r3', fieldLabel: 'C', triggerValues: ['z'], severity: 'Critical', status: 'Active' },
    ]);
    expect(highestSeverityMatch(matches)?.severity).toBe('Malignant');
  });
});

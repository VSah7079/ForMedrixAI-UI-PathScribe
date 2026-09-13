import { describe, it, expect } from 'vitest';
import { resolveQcRuleDraftValidation } from './resolveQcRuleDraftValidation';
import type { NewCytologyQcRule } from './ICytologyQcRuleService';

const validDraft = (): NewCytologyQcRule => ({
  name: 'Test Rule', active: true, evaluationPriority: 50,
  criteria: {}, samplingLogic: { type: 'percentage', ratePercent: 10 },
  peerReviewPriorityTier: 'routine_random', slaHours: 24,
});

describe('resolveQcRuleDraftValidation', () => {
  it('a real, well-formed draft is genuinely valid', () => {
    expect(resolveQcRuleDraftValidation(validDraft()).valid).toBe(true);
  });

  it('a real, empty name is rejected', () => {
    const result = resolveQcRuleDraftValidation({ ...validDraft(), name: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  it('a real percentage rate outside 0.1-100 is rejected', () => {
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'percentage', ratePercent: 0 } }).valid).toBe(false);
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'percentage', ratePercent: 150 } }).valid).toBe(false);
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'percentage', ratePercent: 0.1 } }).valid).toBe(true);
  });

  it('a real, non-integer or non-positive interval value is rejected', () => {
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'interval', everyNthCase: 0 } }).valid).toBe(false);
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'interval', everyNthCase: 2.5 } }).valid).toBe(false);
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'interval', everyNthCase: 5 } }).valid).toBe(true);
  });

  it('a real, non-positive fixed-volume value is rejected', () => {
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'fixed_volume', firstNCases: -1 } }).valid).toBe(false);
    expect(resolveQcRuleDraftValidation({ ...validDraft(), samplingLogic: { type: 'fixed_volume', firstNCases: 50 } }).valid).toBe(true);
  });

  it('a real, non-positive SLA hours value is rejected', () => {
    expect(resolveQcRuleDraftValidation({ ...validDraft(), slaHours: 0 }).valid).toBe(false);
  });
});

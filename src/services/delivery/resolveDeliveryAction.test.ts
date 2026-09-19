// src/services/delivery/resolveDeliveryAction.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDeliveryAction } from './resolveDeliveryAction';
import type { DeliveryRule } from '@/types/delivery/DeliveryRule';

function makeRule(overrides: Partial<DeliveryRule> = {}): DeliveryRule {
  return {
    id: 'rule-1', action: 'DUAL', active: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveDeliveryAction', () => {
  it('no rules at all resolves to the real, spec-stated default (ELECTRONIC_ONLY)', () => {
    const result = resolveDeliveryAction({}, []);
    expect(result.action).toBe('ELECTRONIC_ONLY');
    expect(result.matchedRuleId).toBeUndefined();
  });

  it('an inactive rule never qualifies, even when every real criterion matches perfectly', () => {
    const rule = makeRule({ providerId: 'DR-1', active: false, action: 'SUPPRESS' });
    const result = resolveDeliveryAction({ providerId: 'DR-1' }, [rule]);
    expect(result.action).toBe('ELECTRONIC_ONLY');
  });

  it('a rule with a real criterion that genuinely doesn\u2019t match the input is disqualified entirely, never partially applied', () => {
    const rule = makeRule({ providerId: 'DR-1', action: 'SUPPRESS' });
    const result = resolveDeliveryAction({ providerId: 'DR-2' }, [rule]);
    expect(result.action).toBe('ELECTRONIC_ONLY');
  });

  it('a real, single-criterion rule that matches wins', () => {
    const rule = makeRule({ providerId: 'DR-1', action: 'PRINT_ONLY' });
    const result = resolveDeliveryAction({ providerId: 'DR-1' }, [rule]);
    expect(result.action).toBe('PRINT_ONLY');
    expect(result.matchedRuleId).toBe('rule-1');
  });

  it('a zero-criteria rule (a real, site-wide default an admin set) matches everything, but is the lowest-priority match', () => {
    const wildcard = makeRule({ id: 'wildcard', action: 'SUPPRESS' });
    const specific = makeRule({ id: 'specific', providerId: 'DR-1', action: 'PRINT_ONLY' });
    const result = resolveDeliveryAction({ providerId: 'DR-1' }, [wildcard, specific]);
    expect(result.matchedRuleId).toBe('specific');
    expect(result.action).toBe('PRINT_ONLY');
  });

  it('a rule matching MORE real criteria wins over one matching fewer, even when both technically qualify', () => {
    const oneCriterion = makeRule({ id: 'one', providerId: 'DR-1', action: 'PRINT_ONLY' });
    const twoCriteria = makeRule({ id: 'two', providerId: 'DR-1', pointOfCare: 'OR', action: 'DUAL' });
    const result = resolveDeliveryAction({ providerId: 'DR-1', pointOfCare: 'OR' }, [oneCriterion, twoCriteria]);
    expect(result.matchedRuleId).toBe('two');
    expect(result.action).toBe('DUAL');
  });

  it('real, per the source spec\u2019s own Use Case 3 (Emergency/High-Priority) \u2014 a rule scoped to pointOfCare "OR" and reportType PRELIMINARY resolves DUAL for an OR-floor preliminary release', () => {
    const orRule = makeRule({ pointOfCare: 'OR', reportType: 'PRELIMINARY', action: 'DUAL' });
    const result = resolveDeliveryAction({ pointOfCare: 'OR', reportType: 'PRELIMINARY', providerId: 'DR-9' }, [orRule]);
    expect(result.action).toBe('DUAL');
  });

  it('real, per the source spec\u2019s own Use Case 2 (Hybrid Outpatient Clinic) \u2014 a rule scoped to a specific ordering facility resolves DUAL regardless of provider', () => {
    const clinicRule = makeRule({ orderingFacilityId: 'FAC-CLINIC', action: 'DUAL' });
    const result = resolveDeliveryAction({ orderingFacilityId: 'FAC-CLINIC', providerId: 'DR-ANY' }, [clinicRule]);
    expect(result.action).toBe('DUAL');
  });

  it('a real SUPPRESS rule (hold in portal for manual retrieval) is honored exactly like any other action \u2014 no special-casing', () => {
    const rule = makeRule({ reportType: 'ADDENDUM', action: 'SUPPRESS' });
    const result = resolveDeliveryAction({ reportType: 'ADDENDUM' }, [rule]);
    expect(result.action).toBe('SUPPRESS');
  });

  it('a tie in score is broken by whichever real rule was updated more recently \u2014 the admin\u2019s own most recent, deliberate intent', () => {
    const older = makeRule({ id: 'older', providerId: 'DR-1', action: 'PRINT_ONLY', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeRule({ id: 'newer', providerId: 'DR-1', action: 'SUPPRESS', updatedAt: '2026-06-01T00:00:00.000Z' });
    const result = resolveDeliveryAction({ providerId: 'DR-1' }, [older, newer]);
    expect(result.matchedRuleId).toBe('newer');
    expect(result.action).toBe('SUPPRESS');
  });
});

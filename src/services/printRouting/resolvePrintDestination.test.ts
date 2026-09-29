// src/services/printRouting/resolvePrintDestination.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePrintDestination, PRINT_DESTINATION_SCOPE_PRECEDENCE } from './resolvePrintDestination';
import type { PrintRoutingRule } from '@/types/printRouting/PrintRoutingRule';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

const dest = (label: string): PrintDestination => ({ protocol: 'RAW_9100', ipAddress: '10.0.0.1', displayName: label });

function makeRule(overrides: Partial<PrintRoutingRule> & Pick<PrintRoutingRule, 'scopeType' | 'scopeId' | 'printDestination'>): PrintRoutingRule {
  return {
    id: overrides.id ?? `rule-${Math.random()}`,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('PRINT_DESTINATION_SCOPE_PRECEDENCE', () => {
  it('is real, per §2.1.2’s own literal "most to least specific" order', () => {
    expect(PRINT_DESTINATION_SCOPE_PRECEDENCE).toEqual(['workstation', 'location', 'clientAccount', 'facility']);
  });
});

describe('resolvePrintDestination — outer pass (strict scope-tier order)', () => {
  it('no real rules at all and no real input at all resolves to nothing', () => {
    expect(resolvePrintDestination([], {})).toEqual({});
  });

  it('a real facility-tier rule wins when it is the only real candidate', () => {
    const rule = makeRule({ scopeType: 'facility', scopeId: 'FAC-1', printDestination: dest('facility default') });
    const result = resolvePrintDestination([rule], { facilityId: 'FAC-1' });
    expect(result.destination).toEqual(dest('facility default'));
    expect(result.matchedScopeType).toBe('facility');
    expect(result.matchedRuleId).toBe(rule.id);
  });

  it('a real workstation-tier rule wins over a real facility-tier rule, even though both are real candidates for the same job', () => {
    const workstationRule = makeRule({ scopeType: 'workstation', scopeId: 'WS-1', printDestination: dest('workstation override') });
    const facilityRule = makeRule({ scopeType: 'facility', scopeId: 'FAC-1', printDestination: dest('facility default') });
    const result = resolvePrintDestination([facilityRule, workstationRule], { workstationId: 'WS-1', facilityId: 'FAC-1' });
    expect(result.destination).toEqual(dest('workstation override'));
    expect(result.matchedScopeType).toBe('workstation');
  });

  it('a real location-tier rule wins over client-account and facility tiers, per the real, named precedence order', () => {
    const locationRule = makeRule({ scopeType: 'location', scopeId: 'Theatre 2', printDestination: dest('OR floor') });
    const clientRule = makeRule({ scopeType: 'clientAccount', scopeId: 'CLIENT-1', printDestination: dest('client account') });
    const facilityRule = makeRule({ scopeType: 'facility', scopeId: 'FAC-1', printDestination: dest('facility default') });
    const result = resolvePrintDestination([facilityRule, clientRule, locationRule], {
      pointOfCare: 'Theatre 2', orderingFacilityId: 'CLIENT-1', facilityId: 'FAC-1',
    });
    expect(result.destination).toEqual(dest('OR floor'));
    expect(result.matchedScopeType).toBe('location');
  });

  it('falls through to a real, less specific tier when the more specific tier has no real, matching rule at all', () => {
    const facilityRule = makeRule({ scopeType: 'facility', scopeId: 'FAC-1', printDestination: dest('facility default') });
    // A workstation and location value are present on the input, but no real rule exists for either.
    const result = resolvePrintDestination([facilityRule], { workstationId: 'WS-NOBODY', pointOfCare: 'Nowhere', facilityId: 'FAC-1' });
    expect(result.destination).toEqual(dest('facility default'));
    expect(result.matchedScopeType).toBe('facility');
  });

  it('an inactive rule at a more specific tier is never a real candidate — falls through exactly as if it didn’t exist', () => {
    const inactiveWorkstationRule = makeRule({ scopeType: 'workstation', scopeId: 'WS-1', active: false, printDestination: dest('workstation override') });
    const facilityRule = makeRule({ scopeType: 'facility', scopeId: 'FAC-1', printDestination: dest('facility default') });
    const result = resolvePrintDestination([inactiveWorkstationRule, facilityRule], { workstationId: 'WS-1', facilityId: 'FAC-1' });
    expect(result.destination).toEqual(dest('facility default'));
  });

  it('a userId resolves the real workstation tier when no workstationId is present — either is a real candidate for the same, most-specific tier', () => {
    const rule = makeRule({ scopeType: 'workstation', scopeId: 'USER-1', printDestination: dest('per-user override') });
    const result = resolvePrintDestination([rule], { userId: 'USER-1' });
    expect(result.destination).toEqual(dest('per-user override'));
    expect(result.matchedScopeType).toBe('workstation');
  });

  it('no real value at all for a given tier on the input is never treated as a wildcard scopeId match', () => {
    const rule = makeRule({ scopeType: 'location', scopeId: 'Theatre 2', printDestination: dest('OR floor') });
    const result = resolvePrintDestination([rule], { facilityId: 'FAC-1' }); // no pointOfCare at all
    expect(result.destination).toBeUndefined();
  });
});

describe('resolvePrintDestination — inner pass (specificity tie-break within one real tier)', () => {
  it('a rule matching both real §2.1.1 criteria outranks a wildcard-everything rule at the same real tier', () => {
    const specific = makeRule({
      id: 'specific', scopeType: 'workstation', scopeId: 'WS-1',
      specimenCaseType: 'FROZEN_SECTION', eventTriggerType: 'INITIAL_SIGNOUT',
      printDestination: dest('frozen-section-specific'),
    });
    const wildcard = makeRule({ id: 'wildcard', scopeType: 'workstation', scopeId: 'WS-1', printDestination: dest('wildcard') });
    const result = resolvePrintDestination([wildcard, specific], {
      workstationId: 'WS-1', specimenCaseType: 'FROZEN_SECTION', eventTriggerType: 'INITIAL_SIGNOUT',
    });
    expect(result.destination).toEqual(dest('frozen-section-specific'));
    expect(result.matchedRuleId).toBe('specific');
  });

  it('a rule specifying a real criterion that does NOT match the job’s own real value disqualifies itself entirely at that tier', () => {
    const frozenOnly = makeRule({
      id: 'frozen-only', scopeType: 'workstation', scopeId: 'WS-1',
      specimenCaseType: 'FROZEN_SECTION', printDestination: dest('frozen-only'),
    });
    const wildcard = makeRule({ id: 'wildcard', scopeType: 'workstation', scopeId: 'WS-1', printDestination: dest('wildcard') });
    // Real job is ROUTINE_SURGICAL, not FROZEN_SECTION — frozenOnly must not win, or even tie.
    const result = resolvePrintDestination([frozenOnly, wildcard], { workstationId: 'WS-1', specimenCaseType: 'ROUTINE_SURGICAL' });
    expect(result.destination).toEqual(dest('wildcard'));
    expect(result.matchedRuleId).toBe('wildcard');
  });

  it('a rule matching one real criterion outranks a wildcard, but is itself outranked by a rule matching both', () => {
    const bothMatch = makeRule({
      id: 'both', scopeType: 'facility', scopeId: 'FAC-1',
      specimenCaseType: 'CYTOLOGY', eventTriggerType: 'AMENDED_SIGNOUT', printDestination: dest('both'),
    });
    const oneMatch = makeRule({
      id: 'one', scopeType: 'facility', scopeId: 'FAC-1',
      specimenCaseType: 'CYTOLOGY', printDestination: dest('one'),
    });
    const wildcard = makeRule({ id: 'none', scopeType: 'facility', scopeId: 'FAC-1', printDestination: dest('none') });
    const input = { facilityId: 'FAC-1', specimenCaseType: 'CYTOLOGY' as const, eventTriggerType: 'AMENDED_SIGNOUT' as const };
    expect(resolvePrintDestination([wildcard, oneMatch, bothMatch], input).matchedRuleId).toBe('both');
    expect(resolvePrintDestination([wildcard, oneMatch], { facilityId: 'FAC-1', specimenCaseType: 'CYTOLOGY' as const }).matchedRuleId).toBe('one');
  });

  it('when no real rule at the most specific matching tier qualifies at all (all disqualified by criteria), falls through to the next real tier — never treats a disqualified rule as a weaker match at the same tier', () => {
    const disqualified = makeRule({
      scopeType: 'workstation', scopeId: 'WS-1', specimenCaseType: 'FROZEN_SECTION', printDestination: dest('frozen-only'),
    });
    const facilityFallback = makeRule({ scopeType: 'facility', scopeId: 'FAC-1', printDestination: dest('facility default') });
    const result = resolvePrintDestination([disqualified, facilityFallback], {
      workstationId: 'WS-1', facilityId: 'FAC-1', specimenCaseType: 'ROUTINE_SURGICAL',
    });
    expect(result.destination).toEqual(dest('facility default'));
    expect(result.matchedScopeType).toBe('facility');
  });
});

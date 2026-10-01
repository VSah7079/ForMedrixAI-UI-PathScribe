// src/services/cytology/resolveEffectiveCytologyScreeningStrategyForPatient.test.ts
import { describe, it, expect } from 'vitest';
import { resolveEffectiveCytologyScreeningStrategyForPatient } from './resolveEffectiveCytologyScreeningStrategyForPatient';
import type { CytologyScreeningStrategyConfig } from './ICytologyScreeningStrategyService';

const GERMAN_CONFIG: CytologyScreeningStrategyConfig = {
  screeningStrategy: 'co_testing',
  ageStratifiedRule: { ageThreshold: 35, belowThresholdStrategy: 'cytology_only', atOrAboveThresholdStrategy: 'co_testing' },
};

describe('resolveEffectiveCytologyScreeningStrategyForPatient — real, per direct guidance\'s own German G-BA age rule', () => {
  it('a facility with no real age rule always returns its own, static, base strategy, regardless of age', () => {
    const noRuleConfig: CytologyScreeningStrategyConfig = { screeningStrategy: 'primary_hpv_reflex' };
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(noRuleConfig, 20)).toBe('primary_hpv_reflex');
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(noRuleConfig, 60)).toBe('primary_hpv_reflex');
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(noRuleConfig, undefined)).toBe('primary_hpv_reflex');
  });

  it('a real patient under the German age threshold (20-34) gets cytology_only', () => {
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(GERMAN_CONFIG, 20)).toBe('cytology_only');
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(GERMAN_CONFIG, 34)).toBe('cytology_only');
  });

  it('a real patient AT or above the German age threshold (35+) gets real co-testing', () => {
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(GERMAN_CONFIG, 35)).toBe('co_testing');
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(GERMAN_CONFIG, 60)).toBe('co_testing');
  });

  it('an unknown patient age falls back to the real, base strategy — never a guessed bracket', () => {
    expect(resolveEffectiveCytologyScreeningStrategyForPatient(GERMAN_CONFIG, undefined)).toBe('co_testing');
  });
});

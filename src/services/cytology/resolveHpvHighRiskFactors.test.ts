// src/services/cytology/resolveHpvHighRiskFactors.test.ts
import { describe, it, expect } from 'vitest';
import { resolveHpvHighRiskFactors } from './resolveHpvHighRiskFactors';

describe('resolveHpvHighRiskFactors — real, data-driven bridge to PS-164\'s own High-Risk algorithm', () => {
  it('a real Negative result: neither factor triggers', () => {
    const result = resolveHpvHighRiskFactors('Negative', undefined);
    expect(result.recentHrHpvPositive).toBe(false);
    expect(result.hpvHighRiskGenotype).toBe(false);
  });

  it('a real Positive result with no genotype detail: recentHrHpvPositive triggers, genotype does not', () => {
    const result = resolveHpvHighRiskFactors('Positive', undefined);
    expect(result.recentHrHpvPositive).toBe(true);
    expect(result.hpvHighRiskGenotype).toBe(false);
  });

  it('a real Positive result with HPV16 detected: both factors trigger', () => {
    const result = resolveHpvHighRiskFactors('Positive', { hpv16: true, hpv18Or45: false, otherHighRisk: false });
    expect(result.recentHrHpvPositive).toBe(true);
    expect(result.hpvHighRiskGenotype).toBe(true);
  });

  it('a real Positive result with HPV 18/45 detected: both factors trigger, matching PS-164\'s own "16 or 18/45" grouping', () => {
    const result = resolveHpvHighRiskFactors('Positive', { hpv16: false, hpv18Or45: true, otherHighRisk: false });
    expect(result.hpvHighRiskGenotype).toBe(true);
  });

  it('a real Positive result with ONLY "other high-risk" genotype (not 16 or 18/45): recentHrHpvPositive triggers, genotype does NOT — matches PS-164\'s own narrower real criterion', () => {
    const result = resolveHpvHighRiskFactors('Positive', { hpv16: false, hpv18Or45: false, otherHighRisk: true });
    expect(result.recentHrHpvPositive).toBe(true);
    expect(result.hpvHighRiskGenotype).toBe(false);
  });

  it('genotype detail present but the overall result is NOT Positive: never trusted on its own, both factors false', () => {
    const result = resolveHpvHighRiskFactors('Pending', { hpv16: true, hpv18Or45: true, otherHighRisk: true });
    expect(result.recentHrHpvPositive).toBe(false);
    expect(result.hpvHighRiskGenotype).toBe(false);
  });

  it('no hpvResult at all (test not performed/not on file): neither factor triggers', () => {
    const result = resolveHpvHighRiskFactors(undefined, undefined);
    expect(result.recentHrHpvPositive).toBe(false);
    expect(result.hpvHighRiskGenotype).toBe(false);
  });
});

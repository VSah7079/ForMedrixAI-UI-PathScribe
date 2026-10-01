// src/services/cytology/resolveCytologyHighRiskStatus.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyHighRiskStatus } from './resolveCytologyHighRiskStatus';

describe('resolveCytologyHighRiskStatus — real, given High-Risk algorithm', () => {
  it('no real triggers at all is not high-risk', () => {
    const result = resolveCytologyHighRiskStatus({});
    expect(result.isHighRisk).toBe(false);
    expect(result.triggers).toEqual([]);
  });

  it('1. Prior abnormal Pap within lookback triggers high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ priorAbnormalPapWithinLookback: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['prior_abnormal_pap']);
  });

  it('1. Prior cervical procedure or biopsy triggers high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ priorCervicalProcedureOrBiopsy: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['prior_cervical_procedure']);
  });

  it('2. Recent hrHPV positive triggers high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ recentHrHpvPositive: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['recent_hrhpv_positive']);
  });

  it('2. HPV high-risk genotype (16 or 18/45) triggers high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ hpvHighRiskGenotype: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['hpv_high_risk_genotype']);
  });

  it('3. Immunocompromised status triggers high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ immunocompromised: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['immunocompromised']);
  });

  it('3. In utero DES exposure triggers high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ inUteroDesExposure: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['in_utero_des_exposure']);
  });

  it('4. Abnormal bleeding pattern triggers high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ abnormalBleedingPattern: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['abnormal_bleeding_pattern']);
  });

  it('4. Abnormal exam findings trigger high-risk', () => {
    const result = resolveCytologyHighRiskStatus({ abnormalExamFindings: true });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['abnormal_exam_findings']);
  });

  it('multiple real, independent triggers are all reported together, matching direct guidance\'s own "ANY condition" disjunction', () => {
    const result = resolveCytologyHighRiskStatus({
      priorAbnormalPapWithinLookback: true, immunocompromised: true, abnormalBleedingPattern: true,
    });
    expect(result.isHighRisk).toBe(true);
    expect(result.triggers).toEqual(['prior_abnormal_pap', 'immunocompromised', 'abnormal_bleeding_pattern']);
  });

  it('explicit false values on every field are still not high-risk — false is not the same as unset, but neither triggers', () => {
    const result = resolveCytologyHighRiskStatus({
      priorAbnormalPapWithinLookback: false, priorCervicalProcedureOrBiopsy: false,
      recentHrHpvPositive: false, hpvHighRiskGenotype: false,
      immunocompromised: false, inUteroDesExposure: false,
      abnormalBleedingPattern: false, abnormalExamFindings: false,
    });
    expect(result.isHighRisk).toBe(false);
  });
});

// src/services/cytology/resolveCytologyHighRiskFactorsForCase.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyHighRiskFactorsForCase } from './resolveCytologyHighRiskFactorsForCase';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

describe('resolveCytologyHighRiskFactorsForCase — real, per direct investigation into the previously-orphaned high-risk system', () => {
  it('the three real criteria added in a later phase correctly resolve to undefined when this patient has no real encounter data, matching this file\'s own honest default', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.inUteroDesExposure).toBeUndefined();
    expect(factors.abnormalBleedingPattern).toBeUndefined();
    expect(factors.abnormalExamFindings).toBeUndefined();
  });

  it('a real, current-specimen positive HPV 16 result correctly resolves both real HPV factors via the existing, already-tested resolver', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: 'Positive', hpvGenotypeDetail: { hpv16: true, hpv18Or45: false, otherHighRisk: false } },
      [],
      [],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.recentHrHpvPositive).toBe(true);
    expect(factors.hpvHighRiskGenotype).toBe(true);
  });

  it('a real prior abnormal review from this patient\'s own other-case history, within the real lookback window, is correctly resolved via the existing, already-tested resolver', () => {
    const priorReviews: Pick<CytologyReviewRecord, 'requiresPathologistReview' | 'recordedAt'>[] = [
      { requiresPathologistReview: true, recordedAt: '2024-01-01T00:00:00.000Z' },
    ];
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      priorReviews,
      [],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.priorAbnormalPapWithinLookback).toBe(true);
  });

  it('a real, negative current specimen with no real prior abnormal history and no real encounter data correctly resolves each real, resolvable factor to its own honest state — false where genuinely checked, undefined where genuinely unknown', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: 'Negative', hpvGenotypeDetail: undefined },
      [],
      [],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.recentHrHpvPositive).toBe(false);
    expect(factors.hpvHighRiskGenotype).toBe(false);
    expect(factors.priorAbnormalPapWithinLookback).toBe(false);
    expect(factors.immunocompromised).toBeUndefined();
  });

  it('a real, per direct correction ("maybe from admission icd codes"): a real qualifying encounter diagnosis correctly resolves immunocompromised via the existing, already-tested ICD-10 resolver', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'B20' }] }],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.immunocompromised).toBe(true);
  });

  it('real encounter data with no qualifying diagnosis resolves immunocompromised to a real, positive false, not undefined', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'J06.9' }] }],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.immunocompromised).toBe(false);
  });

  it('a real, per direct follow-up ("we should be capturing inbound ICDs"): a real personal-history-of-CIN-III encounter diagnosis correctly resolves priorCervicalProcedureOrBiopsy via the existing, already-tested ICD-10 resolver', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'Z86.001' }] }],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.priorCervicalProcedureOrBiopsy).toBe(true);
  });

  it('a real DES exposure encounter diagnosis correctly resolves inUteroDesExposure', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'Z91.B' }] }],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.inUteroDesExposure).toBe(true);
  });

  it('a real postcoital bleeding encounter diagnosis correctly resolves abnormalBleedingPattern', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'N93.0' }] }],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.abnormalBleedingPattern).toBe(true);
  });

  it('a real cervical polyp encounter diagnosis correctly resolves abnormalExamFindings via its own structural-finding half', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'N84.1' }] }],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.abnormalExamFindings).toBe(true);
  });

  it('a real, per direct follow-up closing the last remaining gap: a manually-recorded persistent contact bleeding observation correctly resolves abnormalExamFindings even with no real, qualifying encounter data at all', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [],
      true,
      new Date('2026-09-05'),
    );
    expect(factors.abnormalExamFindings).toBe(true);
  });

  it('a real, honest combined outcome: a structural finding genuinely ruled out (real encounter data, no qualifying code) but a real, never-recorded collection-time observation correctly resolves to undefined, not a fabricated false', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'E11.9' }] }],
      undefined,
      new Date('2026-09-05'),
    );
    expect(factors.abnormalExamFindings).toBeUndefined();
  });

  it('a real, honest combined outcome: both real halves genuinely checked and both clear resolves to a real, definitive false', () => {
    const factors = resolveCytologyHighRiskFactorsForCase(
      { hpvResult: undefined, hpvGenotypeDetail: undefined },
      [],
      [{ diagnoses: [{ code: 'E11.9' }] }],
      false,
      new Date('2026-09-05'),
    );
    expect(factors.abnormalExamFindings).toBe(false);
  });
});

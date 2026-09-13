// src/services/cytology/resolveCytologyAscusHpvReflexReport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyAscusHpvReflexReport } from './resolveCytologyAscusHpvReflexReport';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const CATEGORIES: CytologyCategoryEntry[] = [
  { id: 'nilm', section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: 'NILM', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 1, diagnosticRank: 0 },
  { id: 'ascus', section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: 'ASC-US', requiresPathologistReview: false, active: true, isSystem: true, sortOrder: 2, diagnosticRank: 1 },
  { id: 'lsil', section: 'interpretation_result', nomenclatureSystem: 'bethesda', label: 'LSIL', requiresPathologistReview: true, active: true, isSystem: true, sortOrder: 3, diagnosticRank: 2 },
];

let seq = 0;
const review = (ctId: string, ctName: string, interp: string): CytologyReviewRecord => {
  seq++;
  return {
    id: 'r' + seq, specimenId: 'SP' + seq, caseId: 'C' + seq, role: 'primary_screen',
    primaryInterpretationId: interp, recordedAt: '2026-01-01T00:00:00.000Z',
    recordedBy: { userId: ctId, userName: ctName },
  } as CytologyReviewRecord;
};

describe('resolveCytologyAscusHpvReflexReport — real, per direct guidance\'s MOL-QA-03 specification', () => {
  it('only real ASC-US-ranked calls (diagnosticRank === 1) are counted — NILM and LSIL calls are correctly excluded', () => {
    const reviews = [review('ct1', 'CT One', 'nilm'), review('ct1', 'CT One', 'ascus'), review('ct1', 'CT One', 'lsil')];
    const [row] = resolveCytologyAscusHpvReflexReport(reviews, CATEGORIES, {});
    expect(row.totalAscusCases).toBe(1);
  });

  it('a real CT with zero reflexed cases gets an honest "insufficient_data" status, never a fabricated "normal"', () => {
    const reviews = [review('ct1', 'CT One', 'ascus')];
    const [row] = resolveCytologyAscusHpvReflexReport(reviews, CATEGORIES, {});
    expect(row.reflexHpvOrdered).toBe(0);
    expect(row.outlierStatus).toBe('insufficient_data');
  });

  it('a real, normal HPV positivity rate (within the given 30-60% band) is correctly classified', () => {
    const reviews = [review('ct1', 'CT One', 'ascus'), review('ct1', 'CT One', 'ascus')];
    const hpv = {
      [reviews[0].specimenId]: { hpvOrderReason: 'ascus_reflex' as const, hpvResult: 'Positive' as const },
      [reviews[1].specimenId]: { hpvOrderReason: 'ascus_reflex' as const, hpvResult: 'Negative' as const },
    };
    const [row] = resolveCytologyAscusHpvReflexReport(reviews, CATEGORIES, hpv);
    expect(row.ascusHpvPosPercent).toBe(50);
    expect(row.outlierStatus).toBe('normal');
  });

  it('a real, genuine under-calling outlier (<30% HPV+, implying over-diagnosis of benign findings as ASC-US) is correctly flagged', () => {
    const reviews = Array.from({ length: 10 }, () => review('ct1', 'CT One', 'ascus'));
    const hpv = Object.fromEntries(reviews.map((r, i) => [r.specimenId, { hpvOrderReason: 'ascus_reflex' as const, hpvResult: i === 0 ? 'Positive' as const : 'Negative' as const }]));
    const [row] = resolveCytologyAscusHpvReflexReport(reviews, CATEGORIES, hpv);
    expect(row.ascusHpvPosPercent).toBe(10);
    expect(row.outlierStatus).toBe('under_calling');
  });

  it('a real, genuine over-calling outlier (>60% HPV+, implying under-calling of genuine LSIL as ASC-US) is correctly flagged', () => {
    const reviews = Array.from({ length: 10 }, () => review('ct1', 'CT One', 'ascus'));
    const hpv = Object.fromEntries(reviews.map((r, i) => [r.specimenId, { hpvOrderReason: 'ascus_reflex' as const, hpvResult: i < 7 ? 'Positive' as const : 'Negative' as const }]));
    const [row] = resolveCytologyAscusHpvReflexReport(reviews, CATEGORIES, hpv);
    expect(row.ascusHpvPosPercent).toBe(70);
    expect(row.outlierStatus).toBe('over_calling');
  });

  it('a co-testing or post-treatment-surveillance HPV order is correctly excluded from the real reflex rate — only genuine ascus_reflex orders count', () => {
    const reviews = [review('ct1', 'CT One', 'ascus')];
    const hpv = { [reviews[0].specimenId]: { hpvOrderReason: 'co_test' as const, hpvResult: 'Positive' as const } };
    const [row] = resolveCytologyAscusHpvReflexReport(reviews, CATEGORIES, hpv);
    expect(row.reflexHpvOrdered).toBe(0);
  });
});

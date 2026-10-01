// src/services/cytology/resolveCytologyQaComparisonPairs.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyQaComparisonPairs } from './resolveCytologyQaComparisonPairs';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

const review = (overrides: Partial<CytologyReviewRecord>): CytologyReviewRecord => ({
  id: overrides.id ?? 'r' + Math.random(),
  specimenId: 'S1', caseId: 'C1', role: 'primary_screen',
  primaryInterpretationId: 'nilm',
  recordedAt: '2026-01-01T00:00:00.000Z',
  recordedBy: { userId: 'u1', userName: 'Test User' },
  ...overrides,
} as CytologyReviewRecord);

describe('resolveCytologyQaComparisonPairs — real pairing layer', () => {
  it('pairs a primary_screen and a qc_random_selection review on the same specimen', () => {
    const reviews = [
      review({ id: 'r1', specimenId: 'S1', role: 'primary_screen', primaryInterpretationId: 'nilm' }),
      review({ id: 'r2', specimenId: 'S1', role: 'qc_random_selection', primaryInterpretationId: 'ascus' }),
    ];
    const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'qc_random_selection');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].initial.id).toBe('r1');
    expect(pairs[0].followUp.id).toBe('r2');
    expect(pairs[0].specimenId).toBe('S1');
  });

  it('a specimen with no review of the requested follow-up role contributes no real pair', () => {
    const reviews = [
      review({ id: 'r1', specimenId: 'S1', role: 'primary_screen' }),
      review({ id: 'r2', specimenId: 'S2', role: 'pathologist_review' }),
    ];
    const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'qc_random_selection');
    expect(pairs).toHaveLength(0);
  });

  it('correctly isolates pairs across multiple, unrelated specimens', () => {
    const reviews = [
      review({ id: 'r1', specimenId: 'S1', role: 'primary_screen', primaryInterpretationId: 'nilm' }),
      review({ id: 'r2', specimenId: 'S1', role: 'qc_random_selection', primaryInterpretationId: 'nilm' }),
      review({ id: 'r3', specimenId: 'S2', role: 'primary_screen', primaryInterpretationId: 'hsil' }),
      review({ id: 'r4', specimenId: 'S2', role: 'qc_random_selection', primaryInterpretationId: 'lsil' }),
    ];
    const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'qc_random_selection');
    expect(pairs).toHaveLength(2);
    expect(pairs.map(p => p.specimenId).sort()).toEqual(['S1', 'S2']);
  });

  it('a real, genuine re-entry (two reviews of the same role on one specimen) resolves to the most recently recorded one, never an arbitrary pick', () => {
    const reviews = [
      review({ id: 'old', specimenId: 'S1', role: 'primary_screen', primaryInterpretationId: 'nilm', recordedAt: '2026-01-01T00:00:00.000Z' }),
      review({ id: 'new', specimenId: 'S1', role: 'primary_screen', primaryInterpretationId: 'ascus', recordedAt: '2026-01-02T00:00:00.000Z' }),
      review({ id: 'qc1', specimenId: 'S1', role: 'qc_random_selection', primaryInterpretationId: 'ascus' }),
    ];
    const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'qc_random_selection');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].initial.id).toBe('new');
  });

  it('a genuinely empty review list produces zero real pairs', () => {
    expect(resolveCytologyQaComparisonPairs([], 'primary_screen', 'pathologist_review')).toHaveLength(0);
  });

  it('the real CT vs. Pathologist role pairing works the same, generic way', () => {
    const reviews = [
      review({ id: 'ct', specimenId: 'S1', role: 'primary_screen', primaryInterpretationId: 'hsil' }),
      review({ id: 'path', specimenId: 'S1', role: 'pathologist_review', primaryInterpretationId: 'hsil' }),
    ];
    const pairs = resolveCytologyQaComparisonPairs(reviews, 'primary_screen', 'pathologist_review');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].initial.id).toBe('ct');
    expect(pairs[0].followUp.id).toBe('path');
  });
});

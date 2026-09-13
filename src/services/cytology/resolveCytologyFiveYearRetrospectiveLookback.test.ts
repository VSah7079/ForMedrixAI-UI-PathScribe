// src/services/cytology/resolveCytologyFiveYearRetrospectiveLookback.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyFiveYearRetrospectiveLookback } from './resolveCytologyFiveYearRetrospectiveLookback';

const review = (id: string, diagnosticRank: number | undefined, recordedAt: string) => ({
  id, caseId: `case-${id}`, specimenId: `sp-${id}`, recordedAt, diagnosticRank,
});

describe('resolveCytologyFiveYearRetrospectiveLookback — real, per CAP\'s own mandatory 5-year lookback requirement (CYT-QA-03)', () => {
  it('does not trigger at all when the new diagnosis is below the real HSIL/AIS/malignancy threshold (rank 4)', () => {
    const priorReviews = [review('r1', 0, '2024-01-01T00:00:00.000Z')];
    // rank 3 = ASC-H/AGC-NOS — the given specification's own language
    // ("HSIL, AIS, or Malignancy") does not include this tier.
    const result = resolveCytologyFiveYearRetrospectiveLookback(3, priorReviews, new Date('2026-09-05'));
    expect(result).toHaveLength(0);
  });

  it('does not trigger when the triggering review\'s own rank is genuinely unresolvable (undefined)', () => {
    const priorReviews = [review('r1', 0, '2024-01-01T00:00:00.000Z')];
    const result = resolveCytologyFiveYearRetrospectiveLookback(undefined, priorReviews, new Date('2026-09-05'));
    expect(result).toHaveLength(0);
  });

  it('a real HSIL diagnosis (rank 4) correctly triggers and flags a real, genuinely negative (rank 0) prior review within the lookback window', () => {
    const priorReviews = [review('r1', 0, '2024-01-01T00:00:00.000Z')];
    const result = resolveCytologyFiveYearRetrospectiveLookback(4, priorReviews, new Date('2026-09-05'));
    expect(result).toHaveLength(1);
    expect(result[0].reviewId).toBe('r1');
  });

  it('a real malignancy diagnosis (rank 5) also correctly triggers', () => {
    const priorReviews = [review('r1', 0, '2024-01-01T00:00:00.000Z')];
    const result = resolveCytologyFiveYearRetrospectiveLookback(5, priorReviews, new Date('2026-09-05'));
    expect(result).toHaveLength(1);
  });

  it('a real prior ASC-US or LSIL review (rank 1-2) is correctly excluded — it was never negative in the first place, and belongs to a real, different QA mechanism', () => {
    const priorReviews = [review('r1', 1, '2024-01-01T00:00:00.000Z'), review('r2', 2, '2024-06-01T00:00:00.000Z')];
    const result = resolveCytologyFiveYearRetrospectiveLookback(4, priorReviews, new Date('2026-09-05'));
    expect(result).toHaveLength(0);
  });

  it('a real, genuinely negative review OUTSIDE the 5-year lookback window is correctly excluded', () => {
    const priorReviews = [review('r1', 0, '2019-01-01T00:00:00.000Z')];
    const result = resolveCytologyFiveYearRetrospectiveLookback(4, priorReviews, new Date('2026-09-05'));
    expect(result).toHaveLength(0);
  });

  it('multiple real, genuinely negative prior reviews within the window are all flagged, not just the most recent one', () => {
    const priorReviews = [
      review('r1', 0, '2022-01-01T00:00:00.000Z'),
      review('r2', 0, '2024-01-01T00:00:00.000Z'),
      review('r3', 1, '2023-01-01T00:00:00.000Z'), // ASC-US — correctly excluded
    ];
    const result = resolveCytologyFiveYearRetrospectiveLookback(4, priorReviews, new Date('2026-09-05'));
    expect(result.map(r => r.reviewId).sort()).toEqual(['r1', 'r2']);
  });
});

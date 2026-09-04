// src/services/cytology/resolvePriorAbnormalPapFactor.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePriorAbnormalPapFactor } from './resolvePriorAbnormalPapFactor';

const ASOF = new Date('2026-09-03T00:00:00.000Z');

describe('resolvePriorAbnormalPapFactor — real, data-driven from CytologyReviewRecord history', () => {
  it('no prior reviews at all is not a prior-abnormal-Pap factor', () => {
    expect(resolvePriorAbnormalPapFactor([], ASOF)).toBe(false);
  });

  it('a real prior review that never required pathologist review (NILM-tier) does not count', () => {
    const reviews = [{ requiresPathologistReview: false, recordedAt: '2025-01-01T00:00:00.000Z' }];
    expect(resolvePriorAbnormalPapFactor(reviews, ASOF)).toBe(false);
  });

  it('a real prior review that DID require pathologist review, within the real lookback window, counts', () => {
    const reviews = [{ requiresPathologistReview: true, recordedAt: '2025-01-01T00:00:00.000Z' }];
    expect(resolvePriorAbnormalPapFactor(reviews, ASOF)).toBe(true);
  });

  it('a real, genuinely abnormal review OUTSIDE the real lookback window does not count', () => {
    // ~7 years before ASOF, well outside even the real 5-year default.
    const reviews = [{ requiresPathologistReview: true, recordedAt: '2019-06-01T00:00:00.000Z' }];
    expect(resolvePriorAbnormalPapFactor(reviews, ASOF)).toBe(false);
  });

  it('respects a real, explicit, shorter lookback window (e.g. 3 years) when the caller specifies one', () => {
    // 4 years before ASOF — within the real default 5-year window, but
    // outside a real, explicit 3-year one.
    const reviews = [{ requiresPathologistReview: true, recordedAt: '2022-09-01T00:00:00.000Z' }];
    expect(resolvePriorAbnormalPapFactor(reviews, ASOF, 5)).toBe(true);
    expect(resolvePriorAbnormalPapFactor(reviews, ASOF, 3)).toBe(false);
  });

  it('one genuine abnormal review is enough, even among several NILM-tier reviews', () => {
    const reviews = [
      { requiresPathologistReview: false, recordedAt: '2026-01-01T00:00:00.000Z' },
      { requiresPathologistReview: true, recordedAt: '2024-06-01T00:00:00.000Z' },
      { requiresPathologistReview: false, recordedAt: '2023-01-01T00:00:00.000Z' },
    ];
    expect(resolvePriorAbnormalPapFactor(reviews, ASOF)).toBe(true);
  });
});

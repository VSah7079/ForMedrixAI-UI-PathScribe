import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveSurgicalPeerReviewSelectionForCase } from './resolveSurgicalPeerReviewSelectionForCase';
import type { QaSubspecialtyRiskWeight } from '@/types/quality/QaSubspecialtyRiskWeight';

const weights: QaSubspecialtyRiskWeight[] = [
  { id: 'w1', subspecialtyId: 'sub-gi', multiplier: 3, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'u1' },
];

describe('resolveSurgicalPeerReviewSelectionForCase', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never selects when the base rate is unset', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(resolveSurgicalPeerReviewSelectionForCase(undefined, weights, 'sub-gi')).toBe(false);
  });

  it('a weighted subspecialty samples at a real random value that would miss the unweighted rate but hit the weighted one', () => {
    // base 10%, GI weighted 3x -> effective 30%. A random draw of 0.25
    // (25%) misses a flat 10% but hits the real, weighted 30%.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(resolveSurgicalPeerReviewSelectionForCase(10, weights, 'sub-gi')).toBe(true);
    expect(resolveSurgicalPeerReviewSelectionForCase(10, weights, 'sub-unweighted')).toBe(false);
  });

  it('a real 10% base rate over 5000 trials on an unweighted case lands close to 10%', () => {
    let selected = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (resolveSurgicalPeerReviewSelectionForCase(10, weights, undefined)) selected++;
    }
    const proportion = selected / trials;
    expect(proportion).toBeGreaterThan(0.06);
    expect(proportion).toBeLessThan(0.14);
  });

  it('a real 10% base rate over 5000 trials on a 3x-weighted case lands close to 30%, proving the weight actually changes the real sample rate', () => {
    let selected = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (resolveSurgicalPeerReviewSelectionForCase(10, weights, 'sub-gi')) selected++;
    }
    const proportion = selected / trials;
    expect(proportion).toBeGreaterThan(0.24);
    expect(proportion).toBeLessThan(0.36);
  });
});

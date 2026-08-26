import { describe, it, expect, vi, afterEach } from 'vitest';
import { shouldRandomlySampleForCodeReview } from './shouldRandomlySampleForCodeReview';

describe('shouldRandomlySampleForCodeReview - deterministic boundaries', () => {
  it('never samples when the rate is null, undefined, zero, or negative', () => {
    expect(shouldRandomlySampleForCodeReview(null)).toBe(false);
    expect(shouldRandomlySampleForCodeReview(undefined)).toBe(false);
    expect(shouldRandomlySampleForCodeReview(0)).toBe(false);
    expect(shouldRandomlySampleForCodeReview(-5)).toBe(false);
  });

  it('always samples when the rate is 100 or above', () => {
    expect(shouldRandomlySampleForCodeReview(100)).toBe(true);
    expect(shouldRandomlySampleForCodeReview(150)).toBe(true);
  });
});

describe('shouldRandomlySampleForCodeReview - precise, mocked Math.random behavior', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a rate of 50 with Math.random() returning 0.49 (49 < 50) samples true', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.49);
    expect(shouldRandomlySampleForCodeReview(50)).toBe(true);
  });

  it('a rate of 50 with Math.random() returning 0.5 (50 < 50 is false) does not sample - the real, exact boundary', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(shouldRandomlySampleForCodeReview(50)).toBe(false);
  });

  it('a rate of 100 always samples true regardless of the real random value', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(shouldRandomlySampleForCodeReview(100)).toBe(true);
  });

  it('a rate above 100 is clamped to 100, not treated as a >100% chance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(shouldRandomlySampleForCodeReview(500)).toBe(true);
  });
});

describe('shouldRandomlySampleForCodeReview - real, genuine randomness (statistical sanity check)', () => {
  it('a real 50% rate over 5000 real trials lands within a reasonable tolerance band, never suspiciously exact or wildly off', () => {
    let sampled = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (shouldRandomlySampleForCodeReview(50)) sampled++;
    }
    const proportion = sampled / trials;
    // Real statistical tolerance, not an exact 0.5 match - genuine
    // randomness should land close to the configured rate without
    // being pinned to it.
    expect(proportion).toBeGreaterThan(0.44);
    expect(proportion).toBeLessThan(0.56);
  });

  it('a real 10% rate over 5000 real trials lands close to 10%, not close to 50% (confirms the rate is actually used, not ignored)', () => {
    let sampled = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (shouldRandomlySampleForCodeReview(10)) sampled++;
    }
    const proportion = sampled / trials;
    expect(proportion).toBeGreaterThan(0.06);
    expect(proportion).toBeLessThan(0.14);
  });
});

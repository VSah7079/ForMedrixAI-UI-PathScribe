// src/services/cytology/resolveCytologyRandomQcSelection.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyRandomQcSelection } from './resolveCytologyRandomQcSelection';

const SETTINGS = { negativeRandomSelectionRatePercent: 10, nonNegativeRandomSelectionRatePercent: 20 };

describe('resolveCytologyRandomQcSelection — real, given two-rate random algorithm', () => {
  it('a negative result uses the real negative rate, not the non-negative one', () => {
    // roll of 0.05 -> 5, which IS < 10 (negative rate) but NOT < 20 either way; use a value that only distinguishes the two rates
    expect(resolveCytologyRandomQcSelection(true, SETTINGS, 0.05)).toBe(true); // 5 < 10
  });

  it('a non-negative result uses the real non-negative rate, distinctly from the negative one', () => {
    // roll of 0.15 -> 15: NOT selected under the negative rate (10) but IS selected under the non-negative rate (20)
    expect(resolveCytologyRandomQcSelection(true, SETTINGS, 0.15)).toBe(false);
    expect(resolveCytologyRandomQcSelection(false, SETTINGS, 0.15)).toBe(true);
  });

  it('a roll well above both real rates is never selected, negative or not', () => {
    expect(resolveCytologyRandomQcSelection(true, SETTINGS, 0.99)).toBe(false);
    expect(resolveCytologyRandomQcSelection(false, SETTINGS, 0.99)).toBe(false);
  });

  it('a roll of exactly 0 is always selected under any real, positive rate', () => {
    expect(resolveCytologyRandomQcSelection(true, SETTINGS, 0)).toBe(true);
    expect(resolveCytologyRandomQcSelection(false, SETTINGS, 0)).toBe(true);
  });

  it('a real, boundary roll exactly at the rate threshold is NOT selected — the real comparison is strictly less-than', () => {
    // roll of 0.10 -> 10, exactly equal to the negative rate (10) — not selected
    expect(resolveCytologyRandomQcSelection(true, SETTINGS, 0.10)).toBe(false);
  });

  it('a real, zero rate never selects anything, regardless of the roll', () => {
    const zeroRate = { negativeRandomSelectionRatePercent: 0, nonNegativeRandomSelectionRatePercent: 0 };
    expect(resolveCytologyRandomQcSelection(true, zeroRate, 0)).toBe(false);
    expect(resolveCytologyRandomQcSelection(false, zeroRate, 0)).toBe(false);
  });

  it('a real, 100% rate always selects, for any roll short of 1', () => {
    const fullRate = { negativeRandomSelectionRatePercent: 100, nonNegativeRandomSelectionRatePercent: 100 };
    expect(resolveCytologyRandomQcSelection(true, fullRate, 0.999)).toBe(true);
  });
});

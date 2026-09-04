// src/services/cytology/resolveCytologyCategorySetConcordance.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyCategorySetConcordance } from './resolveCytologyCategorySetConcordance';

describe('resolveCytologyCategorySetConcordance', () => {
  it('both empty/undefined is concordant — neither set has anything', () => {
    expect(resolveCytologyCategorySetConcordance(undefined, undefined)).toEqual({ concordant: true, addedByComparison: [], missedByComparison: [] });
    expect(resolveCytologyCategorySetConcordance([], [])).toEqual({ concordant: true, addedByComparison: [], missedByComparison: [] });
  });

  it('identical sets, regardless of array order, are concordant', () => {
    const result = resolveCytologyCategorySetConcordance(['nilm-organism', 'ascus'], ['ascus', 'nilm-organism']);
    expect(result.concordant).toBe(true);
    expect(result.addedByComparison).toEqual([]);
    expect(result.missedByComparison).toEqual([]);
  });

  it('a real, genuine catch — the primary missed something the comparison found — is reported as addedByComparison, not lost in a bare boolean', () => {
    const result = resolveCytologyCategorySetConcordance(['nilm-organism'], ['nilm-organism', 'hsil']);
    expect(result.concordant).toBe(false);
    expect(result.addedByComparison).toEqual(['hsil']);
    expect(result.missedByComparison).toEqual([]);
  });

  it('the comparison set genuinely missing something the primary found is reported as missedByComparison', () => {
    const result = resolveCytologyCategorySetConcordance(['nilm-organism', 'ascus'], ['nilm-organism']);
    expect(result.concordant).toBe(false);
    expect(result.addedByComparison).toEqual([]);
    expect(result.missedByComparison).toEqual(['ascus']);
  });

  it('a real, two-sided discordance — genuinely different findings on both sides — reports both directions correctly', () => {
    const result = resolveCytologyCategorySetConcordance(['ascus'], ['lsil']);
    expect(result.concordant).toBe(false);
    expect(result.addedByComparison).toEqual(['lsil']);
    expect(result.missedByComparison).toEqual(['ascus']);
  });

  it('the same real function correctly serves both a secondary-screening-vs-primary comparison and a final-diagnosis-vs-primary comparison — it only ever compares two category sets, agnostic to what they represent', () => {
    const secondaryVsPrimary = resolveCytologyCategorySetConcordance(['ascus'], ['ascus', 'hsil']);
    const finalDxVsPrimary = resolveCytologyCategorySetConcordance(['ascus'], ['ascus', 'hsil']);
    expect(secondaryVsPrimary).toEqual(finalDxVsPrimary);
  });
});

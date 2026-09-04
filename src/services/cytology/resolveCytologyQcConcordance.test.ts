// src/services/cytology/resolveCytologyQcConcordance.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyQcConcordance } from './resolveCytologyQcConcordance';

describe('resolveCytologyQcConcordance', () => {
  it('both empty/undefined is concordant — neither screener found anything', () => {
    expect(resolveCytologyQcConcordance(undefined, undefined)).toEqual({ concordant: true, addedByQc: [], missedByQc: [] });
    expect(resolveCytologyQcConcordance([], [])).toEqual({ concordant: true, addedByQc: [], missedByQc: [] });
  });

  it('identical sets, regardless of array order, are concordant', () => {
    const result = resolveCytologyQcConcordance(['nilm-organism', 'ascus'], ['ascus', 'nilm-organism']);
    expect(result.concordant).toBe(true);
    expect(result.addedByQc).toEqual([]);
    expect(result.missedByQc).toEqual([]);
  });

  it('a real, genuine QC catch — the primary screener missed something — is reported as addedByQc, not lost in a bare boolean', () => {
    const result = resolveCytologyQcConcordance(['nilm-organism'], ['nilm-organism', 'hsil']);
    expect(result.concordant).toBe(false);
    expect(result.addedByQc).toEqual(['hsil']);
    expect(result.missedByQc).toEqual([]);
  });

  it('the QC screen genuinely missing something the primary screener found is reported as missedByQc', () => {
    const result = resolveCytologyQcConcordance(['nilm-organism', 'ascus'], ['nilm-organism']);
    expect(result.concordant).toBe(false);
    expect(result.addedByQc).toEqual([]);
    expect(result.missedByQc).toEqual(['ascus']);
  });

  it('a real, two-sided discordance — genuinely different findings on both sides — reports both directions correctly', () => {
    const result = resolveCytologyQcConcordance(['ascus'], ['lsil']);
    expect(result.concordant).toBe(false);
    expect(result.addedByQc).toEqual(['lsil']);
    expect(result.missedByQc).toEqual(['ascus']);
  });
});

// src/services/cytology/resolveCytologySecondaryScreeningConcordance.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologySecondaryScreeningConcordance } from './resolveCytologySecondaryScreeningConcordance';

describe('resolveCytologySecondaryScreeningConcordance', () => {
  it('both empty/undefined is concordant — neither screener found anything', () => {
    expect(resolveCytologySecondaryScreeningConcordance(undefined, undefined)).toEqual({ concordant: true, addedByEvent: [], missedByEvent: [] });
    expect(resolveCytologySecondaryScreeningConcordance([], [])).toEqual({ concordant: true, addedByEvent: [], missedByEvent: [] });
  });

  it('identical sets, regardless of array order, are concordant', () => {
    const result = resolveCytologySecondaryScreeningConcordance(['nilm-organism', 'ascus'], ['ascus', 'nilm-organism']);
    expect(result.concordant).toBe(true);
    expect(result.addedByEvent).toEqual([]);
    expect(result.missedByEvent).toEqual([]);
  });

  it('a real, genuine catch — the primary screener missed something — is reported as addedByEvent, not lost in a bare boolean', () => {
    const result = resolveCytologySecondaryScreeningConcordance(['nilm-organism'], ['nilm-organism', 'hsil']);
    expect(result.concordant).toBe(false);
    expect(result.addedByEvent).toEqual(['hsil']);
    expect(result.missedByEvent).toEqual([]);
  });

  it('the secondary screening event genuinely missing something the primary screener found is reported as missedByEvent', () => {
    const result = resolveCytologySecondaryScreeningConcordance(['nilm-organism', 'ascus'], ['nilm-organism']);
    expect(result.concordant).toBe(false);
    expect(result.addedByEvent).toEqual([]);
    expect(result.missedByEvent).toEqual(['ascus']);
  });

  it('a real, two-sided discordance — genuinely different findings on both sides — reports both directions correctly', () => {
    const result = resolveCytologySecondaryScreeningConcordance(['ascus'], ['lsil']);
    expect(result.concordant).toBe(false);
    expect(result.addedByEvent).toEqual(['lsil']);
    expect(result.missedByEvent).toEqual(['ascus']);
  });

  it('works identically regardless of which real trigger (QC random, QC targeted, or Secondary Reviewer) produced the event — this function only ever compares two category sets', () => {
    // Real, per direct correction: the underlying comparison logic is the
    // same regardless of why the secondary screening event happened —
    // trigger-specific behavior belongs to the caller, not this function.
    const qcResult = resolveCytologySecondaryScreeningConcordance(['ascus'], ['ascus', 'hsil']);
    const reviewerResult = resolveCytologySecondaryScreeningConcordance(['ascus'], ['ascus', 'hsil']);
    expect(qcResult).toEqual(reviewerResult);
  });
});

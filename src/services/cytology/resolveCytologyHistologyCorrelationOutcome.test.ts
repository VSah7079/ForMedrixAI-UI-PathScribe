// src/services/cytology/resolveCytologyHistologyCorrelationOutcome.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyHistologyCorrelationOutcome } from './resolveCytologyHistologyCorrelationOutcome';

describe('resolveCytologyHistologyCorrelationOutcome — real, per direct guidance\'s own CYT-QA-04 specification', () => {
  it('either rank genuinely unresolvable (no real mapped SNOMED data yet) resolves to an honest "unresolvable", never a fabricated outcome', () => {
    expect(resolveCytologyHistologyCorrelationOutcome(undefined, 2)).toBe('unresolvable');
    expect(resolveCytologyHistologyCorrelationOutcome(4, undefined)).toBe('unresolvable');
    expect(resolveCytologyHistologyCorrelationOutcome(undefined, undefined)).toBe('unresolvable');
  });

  it('the same real rank on both sides is concordant', () => {
    expect(resolveCytologyHistologyCorrelationOutcome(4, 4)).toBe('concordant');
    expect(resolveCytologyHistologyCorrelationOutcome(0, 0)).toBe('concordant');
  });

  it('a real, exact 1-step difference is a minor discrepancy, per the given specification\'s own exact definition', () => {
    expect(resolveCytologyHistologyCorrelationOutcome(2, 1)).toBe('minor_discrepancy');
    expect(resolveCytologyHistologyCorrelationOutcome(1, 2)).toBe('minor_discrepancy');
  });

  it('a real, 2-or-more-step difference is a major discrepancy', () => {
    expect(resolveCytologyHistologyCorrelationOutcome(0, 4)).toBe('major_discrepancy');
    expect(resolveCytologyHistologyCorrelationOutcome(5, 0)).toBe('major_discrepancy');
    expect(resolveCytologyHistologyCorrelationOutcome(2, 4)).toBe('major_discrepancy');
  });
});

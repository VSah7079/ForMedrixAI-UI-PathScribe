import { describe, it, expect } from 'vitest';
import { classifyGrossingComplexity } from './classifyGrossingComplexity';

describe('classifyGrossingComplexity — real feature, per the Grossing spec\'s CPT-based mode suggestion table', () => {
  it('suggests template mode for a simple, routine CPT code (88305 — core needle biopsy)', () => {
    expect(classifyGrossingComplexity(['88305'])).toBe('template');
  });

  it('suggests narrative mode for a complex CPT code (88307 — e.g. radical resection)', () => {
    expect(classifyGrossingComplexity(['88307'])).toBe('narrative');
  });

  it('suggests narrative mode for 88309 (the other real, explicitly complex code)', () => {
    expect(classifyGrossingComplexity(['88309'])).toBe('narrative');
  });

  it('covers every simple code from the spec\'s own table', () => {
    expect(classifyGrossingComplexity(['88300'])).toBe('template');
    expect(classifyGrossingComplexity(['88302'])).toBe('template');
    expect(classifyGrossingComplexity(['88304'])).toBe('template');
  });

  it('returns unknown (not a guessed default) for a code outside both known sets', () => {
    expect(classifyGrossingComplexity(['88399'])).toBe('unknown');
  });

  it('returns unknown for no assigned codes at all', () => {
    expect(classifyGrossingComplexity([])).toBe('unknown');
    expect(classifyGrossingComplexity(undefined)).toBe('unknown');
  });

  it('a complex code wins if a specimen genuinely carries both a simple and a complex code', () => {
    // Real, deliberate priority: complex-if-any-complex-code-present,
    // since under-flagging genuine complexity is the worse failure
    // mode than over-flagging routine work as complex.
    expect(classifyGrossingComplexity(['88305', '88307'])).toBe('narrative');
  });
});

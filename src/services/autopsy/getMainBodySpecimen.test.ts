import { describe, it, expect } from 'vitest';
import { getMainBodySpecimen } from './getMainBodySpecimen';
import type { Specimen } from '@/types/case/Specimen';

const specimen = (overrides: Partial<Specimen>): Specimen =>
  ({ id: 'sp-1', label: 'A', description: 'Test', ...overrides } as Specimen);

describe('getMainBodySpecimen', () => {
  it('a real, single-specimen case (the overwhelming common case) returns that one specimen', () => {
    const sp = specimen({ id: 'sp-body', label: 'A' });
    expect(getMainBodySpecimen([sp])).toBe(sp);
  });

  it('a real, multi-specimen case (Rule Set 4: truncal body + separately-excised organs) returns the first specimen, matching the real "A is always the main body" convention', () => {
    const body = specimen({ id: 'sp-body', label: 'A' });
    const brain = specimen({ id: 'sp-brain', label: 'B' });
    const heart = specimen({ id: 'sp-heart', label: 'C' });
    expect(getMainBodySpecimen([body, brain, heart])).toBe(body);
  });

  it('a real, genuinely empty specimens array returns undefined, never a fabricated fallback', () => {
    expect(getMainBodySpecimen([])).toBeUndefined();
  });

  it('a real, undefined specimens list (a case with no specimens field at all) returns undefined', () => {
    expect(getMainBodySpecimen(undefined)).toBeUndefined();
  });
});

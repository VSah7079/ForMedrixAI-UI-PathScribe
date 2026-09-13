// src/services/cytology/resolveCisoeAValidation.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCisoeAValidation } from './resolveCisoeAValidation';
import type { CisoeAScore } from '@/types/cytology/CisoeAScore';

const comp = (value: number) => ({ value });
const completeScore = (overrides: Partial<CisoeAScore> = {}): CisoeAScore => ({
  composition: comp(1), inflammation: comp(1), squamous: comp(1), otherEndometrium: comp(1), endocervical: comp(1),
  adequacy: 'satisfactory', ...overrides,
});

describe('resolveCisoeAValidation — real, per direct guidance\'s own mandatory component and adequacy-override rules', () => {
  it('a real, complete score with all 6 components is valid, with no warnings', () => {
    const result = resolveCisoeAValidation(completeScore());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('a real, empty score is invalid, with an error for every one of the 6 real missing components', () => {
    const result = resolveCisoeAValidation({});
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(6);
  });

  it('missing just one real component (Endocervical) is invalid, with exactly one real error', () => {
    const { endocervical, ...partial } = completeScore();
    const result = resolveCisoeAValidation(partial);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Endocervical (E) is required.']);
  });

  it('a real, Unsatisfactory adequacy with normal S/E values is valid, with no warning — nothing abnormal to flag', () => {
    const result = resolveCisoeAValidation(completeScore({ adequacy: 'unsatisfactory' }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('a real, Unsatisfactory adequacy with a genuinely abnormal Squamous value is flagged for review, not hard-blocked', () => {
    const result = resolveCisoeAValidation(completeScore({ adequacy: 'unsatisfactory', squamous: comp(5) }));
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(1);
  });

  it('a real, Unsatisfactory adequacy with a genuinely abnormal Endocervical value is also flagged', () => {
    const result = resolveCisoeAValidation(completeScore({ adequacy: 'unsatisfactory', endocervical: comp(4) }));
    expect(result.warnings.length).toBe(1);
  });
});

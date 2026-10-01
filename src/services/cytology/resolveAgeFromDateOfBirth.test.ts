// src/services/cytology/resolveAgeFromDateOfBirth.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAgeFromDateOfBirth } from './resolveAgeFromDateOfBirth';

describe('resolveAgeFromDateOfBirth', () => {
  it('a real, already-passed birthday this year computes the correct, current age', () => {
    expect(resolveAgeFromDateOfBirth('1990-01-01', new Date('2026-09-04'))).toBe(36);
  });

  it('a real birthday not yet reached this year is one year less', () => {
    expect(resolveAgeFromDateOfBirth('1990-12-31', new Date('2026-09-04'))).toBe(35);
  });

  it('a real birthday exactly today counts as having occurred', () => {
    expect(resolveAgeFromDateOfBirth('1990-09-04', new Date('2026-09-04'))).toBe(36);
  });

  it('no real date of birth on record: undefined, not a guessed default', () => {
    expect(resolveAgeFromDateOfBirth(undefined)).toBeUndefined();
  });

  it('a real, malformed date of birth: undefined, not a fabricated age', () => {
    expect(resolveAgeFromDateOfBirth('not-a-date')).toBeUndefined();
  });
});

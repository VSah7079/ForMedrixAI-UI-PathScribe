// src/utils/isoDateToMDY.test.ts
import { describe, it, expect } from 'vitest';
import { isoDateToMDY } from './isoDateToMDY';

describe('isoDateToMDY — real feature for the Accession page omnibox\'s new DOB (mm/dd/yyyy) search capability', () => {
  it('converts a plain ISO date (yyyy-mm-dd) to mm/dd/yyyy', () => {
    expect(isoDateToMDY('1990-07-23')).toBe('07/23/1990');
  });

  it('converts an ISO date with a time component, using only the date part', () => {
    expect(isoDateToMDY('1958-02-11T00:00:00.000Z')).toBe('02/11/1958');
  });

  it('preserves leading zeros on both month and day', () => {
    expect(isoDateToMDY('2026-01-05')).toBe('01/05/2026');
  });

  it('returns empty string for undefined', () => {
    expect(isoDateToMDY(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(isoDateToMDY(null)).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(isoDateToMDY('')).toBe('');
  });

  it('returns empty string for a malformed, non-ISO date string, rather than a garbled partial match', () => {
    expect(isoDateToMDY('not-a-date')).toBe('');
    expect(isoDateToMDY('07/23/1990')).toBe(''); // already mm/dd/yyyy — not re-parsed
    expect(isoDateToMDY('1990-7-23')).toBe(''); // real ISO requires zero-padded month/day
  });
});

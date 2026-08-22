// src/utils/isoDateForSearch.test.ts
import { describe, it, expect } from 'vitest';
import { isoDateForSearch, dobIncludesQuery, dobExactlyMatches } from './isoDateForSearch';

describe('isoDateForSearch — real fix, per direct follow-up: "Does the DOB take into account locality? UK vs. US."', () => {
  it('formats month-first for MM/DD/YYYY (US)', () => {
    expect(isoDateForSearch('1990-07-23', 'MM/DD/YYYY')).toBe('07/23/1990');
  });

  it('formats day-first for DD/MM/YYYY (UK and every other non-US jurisdiction this app supports) — the real fix this closes', () => {
    expect(isoDateForSearch('1990-07-23', 'DD/MM/YYYY')).toBe('23/07/1990');
  });

  it('correctly differs for a date where day and month are both plausible values — the real ambiguity risk this fix prevents', () => {
    const us = isoDateForSearch('1990-04-03', 'MM/DD/YYYY');
    const gb = isoDateForSearch('1990-04-03', 'DD/MM/YYYY');
    expect(us).toBe('04/03/1990');
    expect(gb).toBe('03/04/1990');
    expect(us).not.toBe(gb);
  });

  it('defaults to MM/DD/YYYY only when no format is explicitly passed', () => {
    expect(isoDateForSearch('1990-07-23')).toBe('07/23/1990');
  });

  it('does not depend on toLocaleDateString/ICU locale data at all — confirmed live en-CA\'s real output is ISO (yyyy-mm-dd), not the dd/mm/yyyy JURISDICTION_LOCALE.CA declares; this function is immune since it never calls toLocaleDateString', () => {
    expect(isoDateForSearch('1990-07-23', 'DD/MM/YYYY')).toBe('23/07/1990');
    expect(isoDateForSearch('1990-07-23', 'DD/MM/YYYY')).not.toBe('1990-07-23');
  });

  it('formats year-first with dashes (YYYY-MM-DD) — real, later extension per direct follow-up naming S. Korea specifically', () => {
    expect(isoDateForSearch('1990-07-23', 'YYYY-MM-DD')).toBe('1990-07-23');
  });

  it('formats year-first with dots (YYYY.MM.DD) — confirmed live via toLocaleDateString(\'ko-KR\', ...) that South Korea\'s real convention is year-first, dot-separated ("1990. 07. 23."), structurally different from the day/month permutation the DD/MM/YYYY vs MM/DD/YYYY fix already handles', () => {
    expect(isoDateForSearch('1990-07-23', 'YYYY.MM.DD')).toBe('1990.07.23');
  });

  it('converts an ISO date with a time component, using only the date part', () => {
    expect(isoDateForSearch('1958-02-11T00:00:00.000Z', 'DD/MM/YYYY')).toBe('11/02/1958');
  });

  it('preserves leading zeros on both month and day, in every format', () => {
    expect(isoDateForSearch('2026-01-05', 'MM/DD/YYYY')).toBe('01/05/2026');
    expect(isoDateForSearch('2026-01-05', 'DD/MM/YYYY')).toBe('05/01/2026');
    expect(isoDateForSearch('2026-01-05', 'YYYY.MM.DD')).toBe('2026.01.05');
  });

  it('returns empty string for undefined, null, or empty string', () => {
    expect(isoDateForSearch(undefined)).toBe('');
    expect(isoDateForSearch(null)).toBe('');
    expect(isoDateForSearch('')).toBe('');
  });

  it('returns empty string for a malformed, non-ISO date string, rather than a garbled partial match', () => {
    expect(isoDateForSearch('not-a-date')).toBe('');
    expect(isoDateForSearch('1990-7-23')).toBe(''); // real ISO requires zero-padded month/day
  });
});

describe('dobIncludesQuery / dobExactlyMatches — shared "try every supported format" helpers', () => {
  it('dobIncludesQuery matches a US-format query', () => {
    expect(dobIncludesQuery('1990-07-23', '07/23')).toBe(true);
  });

  it('dobIncludesQuery matches a UK-format query', () => {
    expect(dobIncludesQuery('1990-07-23', '23/07')).toBe(true);
  });

  it('dobIncludesQuery matches a raw ISO-style query (dash-separated year-first)', () => {
    expect(dobIncludesQuery('1990-07-23', '1990-07-23')).toBe(true);
  });

  it('dobIncludesQuery matches a Korean-style query (dot-separated year-first)', () => {
    expect(dobIncludesQuery('1990-07-23', '1990.07.23')).toBe(true);
  });

  it('dobIncludesQuery returns false for a genuinely unrelated query', () => {
    expect(dobIncludesQuery('1990-07-23', '12/25/1985')).toBe(false);
  });

  it('dobIncludesQuery returns false for a missing DOB, regardless of query', () => {
    expect(dobIncludesQuery(undefined, '07/23')).toBe(false);
    expect(dobIncludesQuery('', '07/23')).toBe(false);
  });

  it('dobExactlyMatches is true for an exact match under any supported format', () => {
    expect(dobExactlyMatches('1990-07-23', '07/23/1990')).toBe(true);
    expect(dobExactlyMatches('1990-07-23', '23/07/1990')).toBe(true);
    expect(dobExactlyMatches('1990-07-23', '1990-07-23')).toBe(true);
    expect(dobExactlyMatches('1990-07-23', '1990.07.23')).toBe(true);
  });

  it('dobExactlyMatches is false for a partial (non-exact) match', () => {
    expect(dobExactlyMatches('1990-07-23', '07/23')).toBe(false);
  });
});

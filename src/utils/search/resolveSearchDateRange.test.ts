// src/utils/search/resolveSearchDateRange.test.ts — Batch 349 (PS-101)
import { describe, it, expect } from 'vitest';
import { resolveSearchDateRange } from './resolveSearchDateRange';

const base = { dateFrom: '2026-08-28', dateTo: '2026-09-27' };

describe('resolveSearchDateRange', () => {
  it('an identifier search with the untouched default range covers all dates', () => {
    expect(resolveSearchDateRange({ ...base, datesChosen: false, hasIdentifier: true })).toEqual({ allDates: true });
  });
  it('a range the user chose is always respected', () => {
    expect(resolveSearchDateRange({ ...base, datesChosen: true, hasIdentifier: true })).toEqual({ ...base, allDates: false });
  });
  it('without an identifier the default range still applies', () => {
    expect(resolveSearchDateRange({ ...base, datesChosen: false, hasIdentifier: false })).toEqual({ ...base, allDates: false });
  });
  it('empty dates are left out', () => {
    expect(resolveSearchDateRange({ dateFrom: '', dateTo: '', datesChosen: true, hasIdentifier: false })).toEqual({ allDates: false });
  });
});

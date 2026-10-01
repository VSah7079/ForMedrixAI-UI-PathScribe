// src/utils/normalizeIdForSearch.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeIdForSearch } from './normalizeIdForSearch';

describe('normalizeIdForSearch — real fix, per direct follow-up: "Scotland and Ireland have different formats for their NHS number, would we do the same approach there?"', () => {
  it('strips spaces so NHS Number\'s own conventional grouping ("999 999 9999") matches an unspaced stored value', () => {
    expect(normalizeIdForSearch('943 476 5919')).toBe('9434765919');
    expect(normalizeIdForSearch('9434765919')).toBe('9434765919');
    expect(normalizeIdForSearch('943 476 5919')).toBe(normalizeIdForSearch('9434765919'));
  });

  it('strips dashes too — PATIENT_ID_BY_JURISDICTION\'s own NHS Number pattern treats \\s and - as interchangeable separators', () => {
    expect(normalizeIdForSearch('943-476-5919')).toBe('9434765919');
    expect(normalizeIdForSearch('943-476 5919')).toBe('9434765919'); // mixed separators
  });

  it('lowercases — real for H&C Number (letters-then-digits) and PPS Number (digits-then-letters), where case shouldn\'t matter for matching', () => {
    expect(normalizeIdForSearch('AB123456')).toBe('ab123456');
    expect(normalizeIdForSearch('1234567T')).toBe('1234567t');
  });

  it('leaves an already-plain CHI Number (10 digits, no natural separator) unchanged besides case', () => {
    expect(normalizeIdForSearch('1401740054')).toBe('1401740054');
  });

  it('is safe, not just convenient — stripping formatting never creates a coincidental match with a genuinely different ID', () => {
    // Two different real IDs, differently spaced — must not collide.
    expect(normalizeIdForSearch('943 476 5919')).not.toBe(normalizeIdForSearch('943 476 5920'));
  });

  it('returns empty string for undefined, null, or empty string', () => {
    expect(normalizeIdForSearch(undefined)).toBe('');
    expect(normalizeIdForSearch(null)).toBe('');
    expect(normalizeIdForSearch('')).toBe('');
  });
});

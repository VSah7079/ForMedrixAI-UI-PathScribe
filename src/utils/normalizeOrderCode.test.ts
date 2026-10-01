import { describe, it, expect } from 'vitest';
import { normalizeOrderCode } from './normalizeOrderCode';

describe('normalizeOrderCode', () => {
  it('uppercases', () => {
    expect(normalizeOrderCode('surg-path')).toBe('SURGPATH');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeOrderCode('  SURG PATH  ')).toBe('SURG PATH');
  });

  it('strips punctuation', () => {
    expect(normalizeOrderCode('SURG-PATH.01')).toBe('SURGPATH01');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeOrderCode('SURG   PATH')).toBe('SURG PATH');
  });

  it('treats differently-punctuated equivalents as the same key', () => {
    const a = normalizeOrderCode('  surg-path ');
    const b = normalizeOrderCode('Surg.Path');
    const c = normalizeOrderCode('SURGPATH');
    expect(a).toBe('SURGPATH');
    expect(b).toBe('SURGPATH');
    expect(c).toBe('SURGPATH');
  });

  it('treats differently-spaced equivalents as the same key', () => {
    const a = normalizeOrderCode('  SURG PATH  ');
    const b = normalizeOrderCode('surg   path');
    expect(a).toBe('SURG PATH');
    expect(b).toBe('SURG PATH');
  });

  it('returns empty string for null/undefined/empty input without throwing', () => {
    expect(normalizeOrderCode(null)).toBe('');
    expect(normalizeOrderCode(undefined)).toBe('');
    expect(normalizeOrderCode('')).toBe('');
  });

  it('leaves alphanumeric codes with no punctuation unchanged apart from case', () => {
    expect(normalizeOrderCode('88305')).toBe('88305');
    expect(normalizeOrderCode('loinc123')).toBe('LOINC123');
  });
});

// Batch 362: ordinal forms per language, including a regional variant.
import { describe, expect, it } from 'vitest';
import { formatOrdinal } from './formatOrdinal';

describe('formatOrdinal', () => {
  it('uses each language’s own form', () => {
    expect(formatOrdinal(2, 'en')).toBe('2nd');
    expect(formatOrdinal(11, 'en')).toBe('11th');
    expect(formatOrdinal(1, 'fr')).toBe('1er');
    expect(formatOrdinal(3, 'de')).toBe('3.');
    expect(formatOrdinal(3, 'nl')).toBe('3e');
    expect(formatOrdinal(3, 'ko')).toBe('3번째');
  });
  it('a regional variant (nl-BE) uses its language’s form', () => {
    expect(formatOrdinal(3, 'nl-BE')).toBe('3e');
    expect(formatOrdinal(3, 'en-GB')).toBe('3rd');
  });
});

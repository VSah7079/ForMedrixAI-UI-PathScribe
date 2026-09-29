import { describe, expect, it } from 'vitest';
import { formatList } from './formatList';

describe('formatList (Batch 356)', () => {
  it('joins in the language given', () => {
    expect(formatList(['a', 'b', 'c'], 'en')).toBe('a, b, and c');
    expect(formatList(['a', 'b'], 'fr')).toBe('a et b');
    expect(formatList(['a', 'b'], 'de')).toBe('a und b');
    expect(formatList(['a'], 'ko')).toBe('a');
  });
});

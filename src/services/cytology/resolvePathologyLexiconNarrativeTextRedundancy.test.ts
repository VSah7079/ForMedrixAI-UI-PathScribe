import { describe, it, expect } from 'vitest';
import { resolvePathologyLexiconNarrativeTextRedundancy } from './resolvePathologyLexiconNarrativeTextRedundancy';
import type { PathologyLexiconEntry } from '@/types/cytology/PathologyLexicon';

describe('resolvePathologyLexiconNarrativeTextRedundancy', () => {
  it('a real lexicon with no narrativeText anywhere produces no findings at all', () => {
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'a', canonicalTerm: 'A', translations: { fr: { text: 'Un', validatedBy: 'x', validatedAt: '2026-01-01', version: 1 } } },
    ];
    expect(resolvePathologyLexiconNarrativeTextRedundancy(lexicon)).toEqual([]);
  });

  it('a real, genuinely distinct narrativeText produces no finding', () => {
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'bethesda.thyroid.category.ii', canonicalTerm: 'Benign', translations: {
        de: { text: 'Benigne', narrativeText: 'gutartig', validatedBy: 'x', validatedAt: '2026-01-01', version: 1 },
      } },
    ];
    expect(resolvePathologyLexiconNarrativeTextRedundancy(lexicon)).toEqual([]);
  });

  it('a real, exact-duplicate narrativeText is flagged with its own real termKey and locale', () => {
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'bethesda.thyroid.category.ii', canonicalTerm: 'Benign', translations: {
        de: { text: 'Benigne', narrativeText: 'Benigne', validatedBy: 'x', validatedAt: '2026-01-01', version: 1 },
      } },
    ];
    expect(resolvePathologyLexiconNarrativeTextRedundancy(lexicon)).toEqual([{ termKey: 'bethesda.thyroid.category.ii', locale: 'de' }]);
  });

  it('a real duplicate differing only in case and surrounding whitespace is still flagged, per the case-insensitive/trimmed rule', () => {
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'x', canonicalTerm: 'X', translations: {
        fr: { text: 'Bénin', narrativeText: '  BÉNIN  ', validatedBy: 'x', validatedAt: '2026-01-01', version: 1 },
      } },
    ];
    expect(resolvePathologyLexiconNarrativeTextRedundancy(lexicon)).toEqual([{ termKey: 'x', locale: 'fr' }]);
  });

  it('real findings are reported across every real locale and every real term in the lexicon, not just the first match', () => {
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'term-a', canonicalTerm: 'A', translations: {
        de: { text: 'Gleich', narrativeText: 'Gleich', validatedBy: 'x', validatedAt: '2026-01-01', version: 1 },
        fr: { text: 'Different', narrativeText: 'Distinct', validatedBy: 'x', validatedAt: '2026-01-01', version: 1 },
      } },
      { termKey: 'term-b', canonicalTerm: 'B', translations: {
        nl: { text: 'Hetzelfde', narrativeText: 'hetzelfde', validatedBy: 'x', validatedAt: '2026-01-01', version: 1 },
      } },
    ];
    expect(resolvePathologyLexiconNarrativeTextRedundancy(lexicon)).toEqual([
      { termKey: 'term-a', locale: 'de' },
      { termKey: 'term-b', locale: 'nl' },
    ]);
  });
});

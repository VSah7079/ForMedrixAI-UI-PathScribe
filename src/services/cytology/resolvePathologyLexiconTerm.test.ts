import { describe, it, expect } from 'vitest';
import { resolvePathologyLexiconTerm } from './resolvePathologyLexiconTerm';
import type { PathologyLexiconEntry } from '@/types/cytology/PathologyLexicon';

const LEXICON: PathologyLexiconEntry[] = [
  {
    termKey: 'bethesda.thyroid.category.iii',
    canonicalTerm: 'Atypia of Undetermined Significance (AUS/FLUS)',
    translations: {
      fr: { text: 'Atypie de signification ind\u00e9termin\u00e9e', validatedBy: 'Dr. Dupont', validatedAt: '2026-01-01', version: 1 },
    },
  },
];

describe('resolvePathologyLexiconTerm', () => {
  it('a real, explicitly validated translation for the requested locale is returned, marked validated', () => {
    const result = resolvePathologyLexiconTerm('bethesda.thyroid.category.iii', 'fr', LEXICON);
    expect(result.text).toBe('Atypie de signification ind\u00e9termin\u00e9e');
    expect(result.isValidatedTranslation).toBe(true);
  });

  it('a real term with no validated translation for the requested locale falls back to the canonical term, never a guess', () => {
    const result = resolvePathologyLexiconTerm('bethesda.thyroid.category.iii', 'de', LEXICON);
    expect(result.text).toBe('Atypia of Undetermined Significance (AUS/FLUS)');
    expect(result.isValidatedTranslation).toBe(false);
  });

  it('a real, unknown term key not in the lexicon at all returns the raw key itself, never a fabricated guess', () => {
    const result = resolvePathologyLexiconTerm('does.not.exist', 'fr', LEXICON);
    expect(result.text).toBe('does.not.exist');
    expect(result.isValidatedTranslation).toBe(false);
  });

  it('the real English/canonical locale is always treated as validated, since it IS the canonical source', () => {
    const result = resolvePathologyLexiconTerm('bethesda.thyroid.category.iii', 'en', LEXICON);
    expect(result.text).toBe('Atypia of Undetermined Significance (AUS/FLUS)');
    expect(result.isValidatedTranslation).toBe(true);
  });

  it('narrative context with no real, distinct narrativeText on record falls back to the same real, validated text used for label context', () => {
    const result = resolvePathologyLexiconTerm('bethesda.thyroid.category.iii', 'fr', LEXICON, 'narrative');
    expect(result.text).toBe('Atypie de signification ind\u00e9termin\u00e9e');
    expect(result.isValidatedTranslation).toBe(true);
  });

  it('narrative context with a real, explicitly validated narrativeText on record prefers it over the standalone label text', () => {
    const lexiconWithDistinctForms: PathologyLexiconEntry[] = [
      {
        termKey: 'bethesda.thyroid.category.ii',
        canonicalTerm: 'Benign',
        translations: {
          de: { text: 'Benigne', narrativeText: 'gutartig', validatedBy: 'Dr. Weber', validatedAt: '2026-01-01', version: 1 },
        },
      },
    ];
    const narrativeResult = resolvePathologyLexiconTerm('bethesda.thyroid.category.ii', 'de', lexiconWithDistinctForms, 'narrative');
    expect(narrativeResult.text).toBe('gutartig');
    const labelResult = resolvePathologyLexiconTerm('bethesda.thyroid.category.ii', 'de', lexiconWithDistinctForms, 'label');
    expect(labelResult.text).toBe('Benigne');
  });

  it('label context (the default, with no context argument at all) is completely unaffected by a real narrativeText on record', () => {
    const lexiconWithDistinctForms: PathologyLexiconEntry[] = [
      {
        termKey: 'bethesda.thyroid.category.ii',
        canonicalTerm: 'Benign',
        translations: {
          de: { text: 'Benigne', narrativeText: 'gutartig', validatedBy: 'Dr. Weber', validatedAt: '2026-01-01', version: 1 },
        },
      },
    ];
    const result = resolvePathologyLexiconTerm('bethesda.thyroid.category.ii', 'de', lexiconWithDistinctForms);
    expect(result.text).toBe('Benigne');
  });
});

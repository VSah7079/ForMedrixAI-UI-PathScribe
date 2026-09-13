import { describe, it, expect } from 'vitest';
import { resolveUnvalidatedTermKeysInAnswers, resolveTranslationAcknowledgmentIsCurrent } from './resolveSynopticTranslationValidation';
import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';
import type { PathologyLexiconEntry } from '@/types/cytology/PathologyLexicon';

const template: SynopticTemplate = {
  id: 'test', name: 'Test', source: 'Custom', version: '1.0.0', category: 'CYTOLOGY_NONGYN', standard: 'Test Standard',
  sections: [
    {
      id: 'diagnosis', title: 'Diagnosis', fields: [
        {
          id: 'category', label: 'Bethesda Category', type: 'dropdown',
          options: [
            { id: 'aus', label: 'AUS/FLUS', lexiconTermKey: 'bethesda.thyroid.category.iii' },
            { id: 'benign', label: 'Benign', lexiconTermKey: 'bethesda.thyroid.category.ii' },
          ],
        },
        { id: 'notes', label: 'Notes', type: 'text', options: undefined },
      ],
    },
  ],
};

const LEXICON: PathologyLexiconEntry[] = [
  { termKey: 'bethesda.thyroid.category.iii', canonicalTerm: 'AUS/FLUS', translations: {} },
  { termKey: 'bethesda.thyroid.category.ii', canonicalTerm: 'Benign', translations: { fr: { text: 'B\u00e9nin', validatedBy: 'Dr. X', validatedAt: '2026-01-01', version: 1 } } },
];

describe('resolveUnvalidatedTermKeysInAnswers', () => {
  it('a real, selected option with no validated translation for the locale is correctly flagged', () => {
    const result = resolveUnvalidatedTermKeysInAnswers(template, { category: 'aus' }, 'fr', LEXICON);
    expect(result).toEqual(['bethesda.thyroid.category.iii']);
  });

  it('a real, selected option WITH a validated translation is never flagged', () => {
    const result = resolveUnvalidatedTermKeysInAnswers(template, { category: 'benign' }, 'fr', LEXICON);
    expect(result).toEqual([]);
  });

  it('a real field with no lexiconTermKey at all (plain text/no clinical term) is never flagged, regardless of its value', () => {
    const result = resolveUnvalidatedTermKeysInAnswers(template, { notes: 'anything' }, 'fr', LEXICON);
    expect(result).toEqual([]);
  });

  it('the real English/canonical locale never flags anything, since it IS the canonical source', () => {
    const result = resolveUnvalidatedTermKeysInAnswers(template, { category: 'aus' }, 'en', LEXICON);
    expect(result).toEqual([]);
  });
});

describe('resolveTranslationAcknowledgmentIsCurrent', () => {
  it('no real unvalidated terms at all means nothing needs acknowledging, regardless of prior state', () => {
    expect(resolveTranslationAcknowledgmentIsCurrent(undefined, [])).toBe(true);
  });

  it('real, unvalidated terms with no acknowledgment on record at all are genuinely not covered', () => {
    expect(resolveTranslationAcknowledgmentIsCurrent(undefined, ['bethesda.thyroid.category.iii'])).toBe(false);
  });

  it('a real, prior acknowledgment that covers every real, currently-unvalidated term is genuinely current', () => {
    const ack = { acknowledgedUnvalidatedTermKeys: ['bethesda.thyroid.category.iii'] };
    expect(resolveTranslationAcknowledgmentIsCurrent(ack, ['bethesda.thyroid.category.iii'])).toBe(true);
  });

  it('a real, prior acknowledgment goes stale the moment a NEW real unvalidated term appears that it never covered', () => {
    const ack = { acknowledgedUnvalidatedTermKeys: ['bethesda.thyroid.category.iii'] };
    expect(resolveTranslationAcknowledgmentIsCurrent(ack, ['bethesda.thyroid.category.iii', 'some.new.term'])).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { compileCytologySynopticNarrative } from './compileCytologySynopticNarrative';
import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';
import type { PathologyLexiconEntry } from '@/types/cytology/PathologyLexicon';

const template: SynopticTemplate = {
  id: 'test-template', name: 'Test', source: 'Custom', version: '1.0.0', category: 'CYTOLOGY_NONGYN', standard: 'Test',
  sections: [
    {
      id: 'specimen', title: 'Specimen',
      fields: [
        {
          id: 'procedure', label: 'Procedure', type: 'dropdown',
          narrativeSentenceTemplate: 'Procedure: {value}.',
          options: [
            { id: 'fna', label: 'FNA', narrativePhrase: 'Fine needle aspiration' },
            { id: 'not_specified', label: 'Not specified' },
          ],
        },
      ],
    },
    {
      id: 'adequacy', title: 'Adequacy',
      fields: [
        {
          id: 'adequacy_status', label: 'Adequacy', type: 'dropdown',
          narrativeSentenceTemplate: 'The specimen is {value}.',
          options: [{ id: 'satisfactory', label: 'Satisfactory', narrativePhrase: 'satisfactory for evaluation' }],
        },
        {
          id: 'unsatisfactory_reason', label: 'Reason', type: 'checkboxes',
          narrativeSentenceTemplate: 'Reason: {value}.',
          options: [
            { id: 'low_cellularity', label: 'Low cellularity', narrativePhrase: 'low cellularity' },
            { id: 'obscuring_blood', label: 'Obscuring blood', narrativePhrase: 'obscuring blood' },
          ],
        },
        {
          id: 'internal_flag', label: 'Internal only', type: 'dropdown',
          options: [{ id: 'x', label: 'X', narrativePhrase: 'should never appear' }],
          // Deliberately no narrativeSentenceTemplate.
        },
      ],
    },
    {
      id: 'comment', title: 'Comment',
      fields: [
        { id: 'comment', label: 'Comment', type: 'longtext', narrativeSentenceTemplate: '{value}' },
      ],
    },
  ],
};

const t = (key: string) => key;
const noLexicon: PathologyLexiconEntry[] = [];

describe('compileCytologySynopticNarrative', () => {
  it('a real, fully-empty answer set compiles to a real, empty result — never a placeholder', () => {
    const result = compileCytologySynopticNarrative(template, {}, t, 'en', noLexicon);
    expect(result.segments).toEqual([]);
    expect(result.rawText).toBe('');
    expect(result.hasUnvalidatedTerms).toBe(false);
  });

  it('a real dropdown answer resolves its own selected option\'s real narrativePhrase into its field\'s own sentence template', () => {
    const result = compileCytologySynopticNarrative(template, { procedure: 'fna' }, t, 'en', noLexicon);
    expect(result.rawText).toBe('Procedure: Fine needle aspiration.');
    expect(result.hasUnvalidatedTerms).toBe(false);
  });

  it('a real dropdown option with no narrativePhrase of its own contributes nothing, even when selected', () => {
    const result = compileCytologySynopticNarrative(template, { procedure: 'not_specified' }, t, 'en', noLexicon);
    expect(result.rawText).toBe('');
  });

  it('a real checkboxes answer joins every real selected option\'s own phrase with a real, plain ", " separator segment', () => {
    const result = compileCytologySynopticNarrative(template, { unsatisfactory_reason: ['low_cellularity', 'obscuring_blood'] }, t, 'en', noLexicon);
    expect(result.rawText).toBe('Reason: low cellularity, obscuring blood.');
    // Real, per direct guidance's own confirmed structure — the ", "
    // separator is its own, real, plain segment, never fused into
    // either neighboring clinical segment's own text.
    expect(result.segments.map(s => s.text)).toEqual(['Reason: ', 'low cellularity', ', ', 'obscuring blood', '.']);
  });

  it('a real field with no narrativeSentenceTemplate of its own is silently skipped, even with a real, matching answer', () => {
    const result = compileCytologySynopticNarrative(template, { internal_flag: 'x' }, t, 'en', noLexicon);
    expect(result.rawText).toBe('');
  });

  it('a real freeform field with no options uses its own real, raw answer text directly as a single, plain segment', () => {
    const result = compileCytologySynopticNarrative(template, { comment: 'Correlate clinically.' }, t, 'en', noLexicon);
    expect(result.rawText).toBe('Correlate clinically.');
    expect(result.segments).toEqual([{ text: 'Correlate clinically.', isUnvalidatedFallback: false }]);
  });

  it('a real, whitespace-only freeform answer contributes nothing', () => {
    const result = compileCytologySynopticNarrative(template, { comment: '   ' }, t, 'en', noLexicon);
    expect(result.rawText).toBe('');
  });

  it('real, multiple answered fields assemble in the real template\'s own section/field order, space-joined', () => {
    const result = compileCytologySynopticNarrative(template, {
      procedure: 'fna',
      adequacy_status: 'satisfactory',
      comment: 'Correlate clinically.',
    }, t, 'en', noLexicon);
    expect(result.rawText).toBe('Procedure: Fine needle aspiration. The specimen is satisfactory for evaluation. Correlate clinically.');
  });

  it('a real field with a real narrativeSentenceTemplateKey resolves it via t(), never the raw English fallback, once a real, current locale provides one', () => {
    const localizedTemplate: SynopticTemplate = {
      ...template,
      sections: [{
        id: 'specimen', title: 'Specimen',
        fields: [{
          id: 'procedure', label: 'Procedure', type: 'dropdown',
          narrativeSentenceTemplate: 'Procedure: {value}.',
          narrativeSentenceTemplateKey: 'narrative.procedure',
          options: [{ id: 'fna', label: 'FNA', narrativePhrase: 'Fine needle aspiration' }],
        }],
      }],
    };
    const tFr = (key: string) => key === 'narrative.procedure' ? 'Acte : {value}.' : key;
    const result = compileCytologySynopticNarrative(localizedTemplate, { procedure: 'fna' }, tFr, 'en', noLexicon);
    expect(result.rawText).toBe('Acte : Fine needle aspiration.');
  });

  it('a real field with no narrativeSentenceTemplateKey of its own always falls back to its own real, raw English narrativeSentenceTemplate, regardless of t', () => {
    const tThatWouldBreakThingsIfCalledWrong = (_key: string) => 'WRONG';
    const result = compileCytologySynopticNarrative(template, { procedure: 'fna' }, tThatWouldBreakThingsIfCalledWrong, 'en', noLexicon);
    expect(result.rawText).toBe('Procedure: Fine needle aspiration.');
  });

  it('an option with a real lexiconTermKey and no real, validated lexicon entry at all falls back to its own real, canonical narrativePhrase, flagged as an unvalidated fallback segment carrying its own real lexiconTermKey', () => {
    const lexiconTemplate: SynopticTemplate = {
      ...template,
      sections: [{
        id: 'diagnostic_category', title: 'Category',
        fields: [{
          id: 'bethesda_category', label: 'Category', type: 'dropdown',
          narrativeSentenceTemplate: 'Category: {value}.',
          options: [{ id: 'ii_benign', label: 'II \u2014 Benign', narrativePhrase: 'II \u2014 Benign', lexiconTermKey: 'bethesda.thyroid.category.ii' }],
        }],
      }],
    };
    const result = compileCytologySynopticNarrative(lexiconTemplate, { bethesda_category: 'ii_benign' }, t, 'de', noLexicon);
    expect(result.rawText).toBe('Category: II \u2014 Benign.');
    expect(result.hasUnvalidatedTerms).toBe(true);
    const flagged = result.segments.find(s => s.isUnvalidatedFallback);
    expect(flagged).toEqual({
      text: 'II \u2014 Benign', isUnvalidatedFallback: true,
      lexiconTermKey: 'bethesda.thyroid.category.ii', fallbackLocale: 'de',
    });
    // Real, per direct guidance's own "Direct Spatial Correlation"
    // requirement — the surrounding chrome text is its own, separate,
    // never-flagged segment; only the real clinical phrase itself
    // carries the flag.
    expect(result.segments.filter(s => !s.isUnvalidatedFallback).map(s => s.text)).toEqual(['Category: ', '.']);
  });

  it('an option with a real lexiconTermKey and a real, validated lexicon entry (text only) uses the validated translation as a real, plain (non-flagged) segment', () => {
    const lexiconTemplate: SynopticTemplate = {
      ...template,
      sections: [{
        id: 'diagnostic_category', title: 'Category',
        fields: [{
          id: 'bethesda_category', label: 'Category', type: 'dropdown',
          narrativeSentenceTemplate: 'Category: {value}.',
          options: [{ id: 'ii_benign', label: 'II \u2014 Benign', narrativePhrase: 'II \u2014 Benign', lexiconTermKey: 'bethesda.thyroid.category.ii' }],
        }],
      }],
    };
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'bethesda.thyroid.category.ii', canonicalTerm: 'II \u2014 Benign', translations: {
        de: { text: 'II \u2014 Benigne', validatedBy: 'Dr. Weber', validatedAt: '2026-01-01', version: 1 },
      } },
    ];
    const result = compileCytologySynopticNarrative(lexiconTemplate, { bethesda_category: 'ii_benign' }, t, 'de', lexicon);
    expect(result.rawText).toBe('Category: II \u2014 Benigne.');
    expect(result.hasUnvalidatedTerms).toBe(false);
    expect(result.segments.every(s => !s.isUnvalidatedFallback)).toBe(true);
  });

  it('an option with a real, validated narrativeText (Path Two) prefers it over the standalone label-context text, as a real, plain (non-flagged) segment', () => {
    const lexiconTemplate: SynopticTemplate = {
      ...template,
      sections: [{
        id: 'diagnostic_category', title: 'Category',
        fields: [{
          id: 'bethesda_category', label: 'Category', type: 'dropdown',
          narrativeSentenceTemplate: 'Category: {value}.',
          options: [{ id: 'ii_benign', label: 'II \u2014 Benign', narrativePhrase: 'II \u2014 Benign', lexiconTermKey: 'bethesda.thyroid.category.ii' }],
        }],
      }],
    };
    const lexicon: PathologyLexiconEntry[] = [
      { termKey: 'bethesda.thyroid.category.ii', canonicalTerm: 'II \u2014 Benign', translations: {
        de: { text: 'II \u2014 Benigne', narrativeText: 'gutartig', validatedBy: 'Dr. Weber', validatedAt: '2026-01-01', version: 1 },
      } },
    ];
    const result = compileCytologySynopticNarrative(lexiconTemplate, { bethesda_category: 'ii_benign' }, t, 'de', lexicon);
    expect(result.rawText).toBe('Category: gutartig.');
    expect(result.hasUnvalidatedTerms).toBe(false);
  });
});

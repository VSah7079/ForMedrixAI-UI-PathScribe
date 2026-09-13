import { describe, it, expect } from 'vitest';
import { resolveSynopticFieldLabel, resolveSynopticOptionLabel, resolveSynopticSectionTitle } from './resolveSynopticFieldLabel';

const t = (key: string) => `TRANSLATED[${key}]`;

describe('resolveSynopticFieldLabel', () => {
  it('a real, current-schema field with only a plain label returns that label directly', () => {
    expect(resolveSynopticFieldLabel({ label: 'Procedure' }, t)).toBe('Procedure');
  });

  it('a real, future-schema field with a labelKey prefers the translated key over the plain label', () => {
    expect(resolveSynopticFieldLabel({ label: 'Procedure', labelKey: 'synoptic.thyroid.procedure.label' }, t)).toBe('TRANSLATED[synoptic.thyroid.procedure.label]');
  });
});

describe('resolveSynopticOptionLabel', () => {
  it('the same real precedence applies to option labels', () => {
    expect(resolveSynopticOptionLabel({ label: 'Right lobe' }, t)).toBe('Right lobe');
    expect(resolveSynopticOptionLabel({ label: 'Right lobe', labelKey: 'synoptic.thyroid.site.right' }, t)).toBe('TRANSLATED[synoptic.thyroid.site.right]');
  });
});

describe('resolveSynopticSectionTitle', () => {
  it('the same real precedence applies to section titles', () => {
    expect(resolveSynopticSectionTitle({ title: 'Specimen' }, t)).toBe('Specimen');
    expect(resolveSynopticSectionTitle({ title: 'Specimen', titleKey: 'synoptic.thyroid.specimen.title' }, t)).toBe('TRANSLATED[synoptic.thyroid.specimen.title]');
  });
});

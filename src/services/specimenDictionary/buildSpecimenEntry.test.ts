import { describe, it, expect } from 'vitest';
import { buildSpecimenEntry, type SpecimenEntryDraft } from './buildSpecimenEntry';
import type { SpecimenEntry } from './specimenTypes';

const opts = { now: '2026-09-24T00:00:00.000Z', newId: () => 'sp-new', updatedBy: 'admin' };

const stored: SpecimenEntry = {
  id: 'sp-1', name: 'Thyroid FNA', type: 'Cytology', procedure: 'FNA', normalizedLabel: 'Thyroid FNA',
  synonyms: ['THY-FNA'], active: true, version: 3, updatedBy: 'x', updatedAt: 'y',
  protocolId: 'proto-1', specimenCategory: 'NON_GYN_CYTOLOGY' as SpecimenEntry['specimenCategory'],
  defaultComplexity: 'GROSS_AND_MICRO' as SpecimenEntry['defaultComplexity'], microUpgradeBaseCptCode: '88305',
  organSite: 'THYROID', isSelfCollected: false, defaultSynopticTemplateId: 'thyroid_fna_cytology',
};

const draftOf = (e: SpecimenEntry): SpecimenEntryDraft => ({ ...e, synonymsText: e.synonyms.join(', '), defaultStainsText: '' });

describe('buildSpecimenEntry', () => {
  it('an edit keeps every stored field the form does not show (regression: they used to be wiped)', () => {
    const saved = buildSpecimenEntry({ ...draftOf(stored), processingNotes: 'Submit all' }, stored, opts);
    expect(saved.defaultComplexity).toBe('GROSS_AND_MICRO');
    expect(saved.microUpgradeBaseCptCode).toBe('88305');
    expect(saved.organSite).toBe('THYROID');
    expect(saved.defaultSynopticTemplateId).toBe('thyroid_fna_cytology');
    expect(saved.processingNotes).toBe('Submit all');
    expect(saved.id).toBe('sp-1');
    expect(saved.version).toBe(4);
  });

  it('protocol and specimen category chosen in the form are actually saved (regression: they were dropped)', () => {
    const saved = buildSpecimenEntry({ ...draftOf(stored), protocolId: 'proto-2', specimenCategory: undefined }, stored, opts);
    expect(saved.protocolId).toBe('proto-2');
    expect(saved.specimenCategory).toBeUndefined();
  });

  it('an add gets a new id and version 1, even when the draft came from a duplicate carrying a placeholder id', () => {
    const saved = buildSpecimenEntry({ ...draftOf(stored), id: '__clone__', name: '  Thyroid FNA (copie) ' }, undefined, opts);
    expect(saved.id).toBe('sp-new');
    expect(saved.version).toBe(1);
    expect(saved.name).toBe('Thyroid FNA (copie)');
    expect(saved.normalizedLabel).toBe('Thyroid FNA (copie)');
    expect(saved.protocolId).toBe('proto-1');
    expect(saved.updatedAt).toBe(opts.now);
  });

  it('the text-input helpers never reach the stored record', () => {
    const saved = buildSpecimenEntry(draftOf(stored), stored, opts) as SpecimenEntry & Record<string, unknown>;
    expect(saved.synonymsText).toBeUndefined();
    expect(saved.defaultStainsText).toBeUndefined();
  });
});

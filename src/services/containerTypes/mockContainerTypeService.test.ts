// src/services/containerTypes/mockContainerTypeService.test.ts
import { describe, it, expect } from 'vitest';
import { mockContainerTypeService } from './mockContainerTypeService';

describe('mockContainerTypeService \u2014 real, per direct guidance\u2019s own ProcessingContainer seed set', () => {
  it('a real getAll returns every real, size-specific jar/bucket named in direct guidance, alongside the original 9 workflow-focused entries', async () => {
    const res = await mockContainerTypeService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ids = res.data.map(c => c.id);
    for (const id of [
      'jar-20ml-prefilled', 'jar-40ml-prefilled', 'jar-60ml-empty', 'jar-120ml-prefilled',
      'bucket-500ml', 'bucket-1l', 'bucket-2-5l', 'bucket-5l',
      'surepath-vial', 'cytolyt-tube', 'em-glutaraldehyde-vial',
      // The original 9 must still be present, unchanged in id.
      'small-biopsy-vial', 'medium-large-specimen-container', 'fresh-dry-container',
      'lbc-vial', 'thinprep-vial', 'fna-tube', 'unfixed-body-fluid-container',
      'rpmi-1640-media-tube', 'michels-zeus-media-vial',
    ]) {
      expect(ids, `expected ${id} to be present`).toContain(id);
    }
    expect(ids.length).toBe(new Set(ids).size); // no duplicate ids
  });

  it('a real prefilled fixative container has both defaultFixativeId and isPrefilled set consistently', async () => {
    const res = await mockContainerTypeService.getAll();
    if (!res.ok) return;
    const jar20 = res.data.find(c => c.id === 'jar-20ml-prefilled');
    expect(jar20?.capacityMl).toBe(20);
    expect(jar20?.defaultFixativeId).toBe('fx-nbf10');
    expect(jar20?.isPrefilled).toBe(true);
  });

  it('a real, genuinely dry container has no default fixative and isPrefilled: false, never a fabricated fixative reference', async () => {
    const res = await mockContainerTypeService.getAll();
    if (!res.ok) return;
    const jar60 = res.data.find(c => c.id === 'jar-60ml-empty');
    expect(jar60?.defaultFixativeId).toBeUndefined();
    expect(jar60?.isPrefilled).toBe(false);
  });

  it('ThinPrep and SurePath are real, genuinely separate entries with different default fixatives, per direct guidance\u2019s own reasoning for why a generic LBC Vial can\u2019t distinguish them', async () => {
    const res = await mockContainerTypeService.getAll();
    if (!res.ok) return;
    const thinprep = res.data.find(c => c.id === 'thinprep-vial');
    const surepath = res.data.find(c => c.id === 'surepath-vial');
    expect(thinprep?.defaultFixativeId).toBe('fx-cytolyt');
    expect(surepath?.defaultFixativeId).toBe('fx-cytorich');
    expect(thinprep?.id).not.toBe(surepath?.id);
  });

  it('the real EM glutaraldehyde vial references the real, correct fixative catalog entry', async () => {
    const res = await mockContainerTypeService.getAll();
    if (!res.ok) return;
    const emVial = res.data.find(c => c.id === 'em-glutaraldehyde-vial');
    expect(emVial?.defaultFixativeId).toBe('fx-glut25');
    expect(emVial?.capacityMl).toBe(5);
  });
});

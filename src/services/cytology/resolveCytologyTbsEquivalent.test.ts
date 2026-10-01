// src/services/cytology/resolveCytologyTbsEquivalent.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyTbsEquivalent, MUNCHEN_IIIB_TO_TBS_MAPPING } from './resolveCytologyTbsEquivalent';
import { mockCytologyCategoryService } from './mockCytologyCategoryService';

describe('resolveCytologyTbsEquivalent — real, per direct RFP guidance\'s own "Dual Nomenclature Mapping"', () => {
  it('a real, direct-confirmed mapping (II-p -> ASC-US) resolves correctly', () => {
    const result = resolveCytologyTbsEquivalent('mn3-group-iip');
    expect(result?.targetCategoryId).toBe('cyto-squam-ascus');
    expect(result?.isExactEquivalent).toBe(true);
  });

  it('a real, direct-confirmed mapping (III-p -> ASC-H) resolves correctly — genuinely distinct from II-p\'s own target', () => {
    const result = resolveCytologyTbsEquivalent('mn3-group-iiip');
    expect(result?.targetCategoryId).toBe('cyto-squam-asch');
  });

  it('the real, confirmed IIID1 -> LSIL and IIID2 -> HSIL grade mapping is correct', () => {
    expect(resolveCytologyTbsEquivalent('mn3-group-iiid1')?.targetCategoryId).toBe('cyto-squam-lsil');
    expect(resolveCytologyTbsEquivalent('mn3-group-iiid2')?.targetCategoryId).toBe('cyto-squam-hsil');
  });

  it('Group IIa — real, honest: no true Bethesda equivalent exists, so its mapping is explicitly marked non-exact', () => {
    const result = resolveCytologyTbsEquivalent('mn3-group-iia');
    expect(result?.isExactEquivalent).toBe(false);
    expect(result?.notes).toContain('no real Bethesda counterpart');
  });

  it('an unmapped/unknown category id returns undefined, not a fabricated guess', () => {
    expect(resolveCytologyTbsEquivalent('does-not-exist')).toBeUndefined();
  });

  it('every real München III interpretation_result category has a real mapping entry — none silently missing', async () => {
    const mn3 = await mockCytologyCategoryService.getByNomenclatureSystem('munchen_iiib');
    if (!mn3.ok) throw new Error('setup failed');
    const interpretationEntries = mn3.data.filter(e => e.section === 'interpretation_result');
    for (const entry of interpretationEntries) {
      expect(resolveCytologyTbsEquivalent(entry.id), `missing mapping for ${entry.id}`).toBeDefined();
    }
  });

  it('every real mapping target id genuinely exists in the live Bethesda dictionary — no dangling references', async () => {
    const bethesda = await mockCytologyCategoryService.getByNomenclatureSystem('bethesda');
    if (!bethesda.ok) throw new Error('setup failed');
    const bethesdaIds = new Set(bethesda.data.map(e => e.id));
    for (const mapping of MUNCHEN_IIIB_TO_TBS_MAPPING) {
      expect(bethesdaIds.has(mapping.targetCategoryId), `dangling target: ${mapping.targetCategoryId}`).toBe(true);
    }
  });
});

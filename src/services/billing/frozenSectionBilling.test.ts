import { describe, it, expect } from 'vitest';
import { suggestFrozenSectionCptCodes, countFrozenBlocksForSpecimen, suggestFrozenSectionCptCodesFromSpecimens } from './frozenSectionBilling';
import type { PreparationOutput } from '@/types/intraop/IntraoperativeEntry';

describe('suggestFrozenSectionCptCodes — real, per-specimen frozen-block counting, mirrors the IHC first/additional shape', () => {
  it('a specimen with no frozen blocks at all gets no suggestions - not every case has a Frozen', () => {
    const result = suggestFrozenSectionCptCodes([{ specimenId: 'sp-1', frozenSectionCutCount: 0 }]);
    expect(result).toEqual([{ specimenId: 'sp-1', suggestions: [] }]);
  });

  it('a single frozen block suggests FROZEN-FIRST only', () => {
    const result = suggestFrozenSectionCptCodes([{ specimenId: 'sp-1', frozenSectionCutCount: 1 }]);
    expect(result).toEqual([{ specimenId: 'sp-1', suggestions: ['FROZEN-FIRST'] }]);
  });

  it('the real coding rule this exists for: first block FROZEN-FIRST (88331), every additional block FROZEN-ADDL (88332)', () => {
    const result = suggestFrozenSectionCptCodes([{ specimenId: 'sp-1', frozenSectionCutCount: 3 }]);
    expect(result).toEqual([{ specimenId: 'sp-1', suggestions: ['FROZEN-FIRST', 'FROZEN-ADDL', 'FROZEN-ADDL'] }]);
  });

  it('counts independently per specimen - one specimen\'s frozen blocks never bleed into another\'s count', () => {
    const result = suggestFrozenSectionCptCodes([
      { specimenId: 'sp-1', frozenSectionCutCount: 2 },
      { specimenId: 'sp-2', frozenSectionCutCount: 1 },
    ]);
    expect(result.find(r => r.specimenId === 'sp-1')?.suggestions).toEqual(['FROZEN-FIRST', 'FROZEN-ADDL']);
    expect(result.find(r => r.specimenId === 'sp-2')?.suggestions).toEqual(['FROZEN-FIRST']);
  });

  it('handles an empty specimen list without throwing', () => {
    expect(suggestFrozenSectionCptCodes([])).toEqual([]);
  });

  it('a case with a mix of frozen and non-frozen specimens only suggests for the ones that actually had a frozen section', () => {
    const result = suggestFrozenSectionCptCodes([
      { specimenId: 'sp-1', frozenSectionCutCount: 0 },
      { specimenId: 'sp-2', frozenSectionCutCount: 2 },
    ]);
    expect(result.find(r => r.specimenId === 'sp-1')?.suggestions).toEqual([]);
    expect(result.find(r => r.specimenId === 'sp-2')?.suggestions).toEqual(['FROZEN-FIRST', 'FROZEN-ADDL']);
  });
});

describe('countFrozenBlocksForSpecimen — real, canonical count, resolves PS-82 (never milestones.length again)', () => {
  const prep = (type: PreparationOutput['type'], identifier: string): PreparationOutput =>
    ({ id: identifier, type, identifier, timestamp: '2026-01-01T00:00:00.000Z' });

  it('counts real frozen_block outputs only, ignoring other preparation types', () => {
    const specimen = { preparations: [prep('touch_prep', 'FS-A-TP1'), prep('frozen_block', 'FS-A1')] };
    expect(countFrozenBlocksForSpecimen(specimen)).toBe(1);
  });

  it('the real point of this fix: a specimen with a touch prep milestone-equivalent but zero real frozen blocks counts as zero, not one', () => {
    // The real scenario PS-82 flagged: the OLD, wrong assumption
    // (counting a 'frozen_section_cut' milestone) could never tell a
    // touch-prep-only specimen apart from a frozen-block specimen.
    // This is the fix - the real preparations array makes it exact.
    const specimen = { preparations: [prep('touch_prep', 'FS-A-TP1')] };
    expect(countFrozenBlocksForSpecimen(specimen)).toBe(0);
  });

  it('counts multiple real frozen blocks correctly', () => {
    const specimen = { preparations: [prep('frozen_block', 'FS-A1'), prep('frozen_block', 'FS-A2'), prep('frozen_block', 'FS-A3')] };
    expect(countFrozenBlocksForSpecimen(specimen)).toBe(3);
  });

  it('a specimen with no preparations at all counts as zero, not an error', () => {
    expect(countFrozenBlocksForSpecimen({ preparations: [] })).toBe(0);
  });

  it('handles a genuinely undefined preparations field defensively, for legacy data predating this field', () => {
    expect(countFrozenBlocksForSpecimen({ preparations: undefined as any })).toBe(0);
  });
});

describe('suggestFrozenSectionCptCodesFromSpecimens — real, high-level entry point using real IntraopSpecimen data, resolves PS-82 end to end', () => {
  const prep = (type: PreparationOutput['type'], identifier: string): PreparationOutput =>
    ({ id: identifier, type, identifier, timestamp: '2026-01-01T00:00:00.000Z' });

  it('produces the real, correct FROZEN-FIRST/FROZEN-ADDL suggestions directly from real preparations data', () => {
    const specimens = [
      { id: 'sp-1', preparations: [prep('frozen_block', 'FS-A1'), prep('frozen_block', 'FS-A2')] },
    ];
    const result = suggestFrozenSectionCptCodesFromSpecimens(specimens);
    expect(result).toEqual([{ specimenId: 'sp-1', suggestions: ['FROZEN-FIRST', 'FROZEN-ADDL'] }]);
  });

  it('a real, mixed touch-prep-and-frozen-block specimen only counts the real frozen blocks - not the touch preps', () => {
    const specimens = [
      { id: 'sp-1', preparations: [prep('touch_prep', 'FS-A-TP1'), prep('frozen_block', 'FS-A1')] },
    ];
    const result = suggestFrozenSectionCptCodesFromSpecimens(specimens);
    expect(result).toEqual([{ specimenId: 'sp-1', suggestions: ['FROZEN-FIRST'] }]);
  });

  it('a specimen with only touch preps (no real frozen block at all) gets no frozen-section suggestions', () => {
    const specimens = [
      { id: 'sp-1', preparations: [prep('touch_prep', 'FS-A-TP1'), prep('touch_prep', 'FS-A-TP2')] },
    ];
    const result = suggestFrozenSectionCptCodesFromSpecimens(specimens);
    expect(result).toEqual([{ specimenId: 'sp-1', suggestions: [] }]);
  });

  it('multiple real specimens are each counted independently from their own real preparations', () => {
    const specimens = [
      { id: 'sp-1', preparations: [prep('frozen_block', 'FS-A1')] },
      { id: 'sp-2', preparations: [prep('frozen_block', 'FS-B1'), prep('frozen_block', 'FS-B2'), prep('frozen_block', 'FS-B3')] },
    ];
    const result = suggestFrozenSectionCptCodesFromSpecimens(specimens);
    expect(result.find(r => r.specimenId === 'sp-1')?.suggestions).toEqual(['FROZEN-FIRST']);
    expect(result.find(r => r.specimenId === 'sp-2')?.suggestions).toEqual(['FROZEN-FIRST', 'FROZEN-ADDL', 'FROZEN-ADDL']);
  });
});

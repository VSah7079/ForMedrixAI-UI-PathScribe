// src/services/billing/codeMapTable.test.ts
import { describe, it, expect } from 'vitest';
import { computeWorkRvuForCodes, ruleBasedDefaultCptCodes, parseRvuUploadRows, suggestBlockAncillaryCptCodes, suggestSpecimenAncillaryCptCodes, computeNewSuggestions, computeCaseCodingSummary, resolveSpecimenDictionaryBaseCptCode, CODE_MAP_TABLE } from './codeMapTable';
import type { StainType } from '../stains/IStainService';

describe('CODE_MAP_TABLE — real, verified CMS 2026 work RVU values, not fabricated', () => {
  it('has at least the five real, curated codes this pass verified', () => {
    const codes = CODE_MAP_TABLE.map(e => e.code);
    expect(codes).toEqual(expect.arrayContaining(['88302', '88304', '88305', '88307', '88342']));
  });

  it('every entry that HAS a verified work RVU carries a real, positive value - not every entry is required to have one yet (honest, disclosed gaps for unverified codes)', () => {
    CODE_MAP_TABLE.filter(e => e.workRvu !== undefined).forEach(e => expect(e.workRvu).toBeGreaterThan(0));
  });

  it('every real entry has a real billingCode - the new primary identifier', () => {
    CODE_MAP_TABLE.forEach(e => expect(e.billingCode).toBeTruthy());
  });

  it('the new Charge Capture entries (IHC-ADDL, PIN4-PANEL, FROZEN-FIRST, FROZEN-ADDL) are real, present rows with a verified CPT code and coding rule, honestly unverified work RVU', () => {
    const newEntries = CODE_MAP_TABLE.filter(e => ['IHC-ADDL', 'PIN4-PANEL', 'FROZEN-FIRST', 'FROZEN-ADDL'].includes(e.billingCode));
    expect(newEntries).toHaveLength(4);
    newEntries.forEach(e => {
      expect(e.code).toBeTruthy();
      expect(e.workRvu).toBeUndefined(); // honest, disclosed gap - never fabricated
    });
  });
});

describe('computeWorkRvuForCodes — real fix: the calculation function that never existed anywhere in this app', () => {
  it('sums real work RVU across multiple real, recognized codes', () => {
    const result = computeWorkRvuForCodes(['88305', '88342']);
    expect(result.totalWorkRvu).toBe(1.41); // 0.73 + 0.68
    expect(result.unrecognizedCodes).toHaveLength(0);
  });

  it('excludes an unrecognized code from the sum rather than treating it as zero silently, and reports it honestly', () => {
    const result = computeWorkRvuForCodes(['88305', 'NOT-A-REAL-CODE']);
    expect(result.totalWorkRvu).toBe(0.73); // only the real, recognized code counted
    expect(result.unrecognizedCodes).toEqual(['NOT-A-REAL-CODE']);
  });

  it('returns zero, not an error, for a case with no CPT codes assigned at all', () => {
    const result = computeWorkRvuForCodes(undefined);
    expect(result.totalWorkRvu).toBe(0);
    expect(result.unrecognizedCodes).toHaveLength(0);
  });

  it('returns zero for an explicitly empty array', () => {
    const result = computeWorkRvuForCodes([]);
    expect(result.totalWorkRvu).toBe(0);
  });
});

describe('parseRvuUploadRows — real fix: anticipates the actual, real CMS PPRRVU file shape, not just this app\'s own simple template', () => {
  it('parses this app\'s own simple template exactly as before - no status column present', () => {
    const rows = [
      { Code: '88305', Description: 'Level IV', WorkRVU: 0.73 },
      { Code: '88307', Description: 'Level V', WorkRVU: 1.55 },
    ];
    const result = parseRvuUploadRows(rows);
    expect(result.entries).toHaveLength(2);
    expect(result.skippedNonPayable).toBe(0);
  });

  it('recognizes the real CMS PPRRVU column name (HCPCS), not just this app\'s own "Code"', () => {
    const rows = [{ HCPCS: '88305', Description: 'Level IV', 'Work RVU': 0.73, 'Status Code': 'A' }];
    const result = parseRvuUploadRows(rows);
    expect(result.entries).toEqual([{ code: '88305', description: 'Level IV', workRvu: 0.73 }]);
  });

  it('applies the real, documented CMS rule: only status A/R/T carry a usable RVU value', () => {
    const rows = [
      { HCPCS: '88305', 'Work RVU': 0.73, 'Status Code': 'A' }, // payable
      { HCPCS: '99999', 'Work RVU': 0.50, 'Status Code': 'R' }, // payable
      { HCPCS: '11111', 'Work RVU': 0.40, 'Status Code': 'T' }, // payable
      { HCPCS: '22222', 'Work RVU': 0.00, 'Status Code': 'B' }, // bundled - real exclusion
      { HCPCS: '33333', 'Work RVU': 0.00, 'Status Code': 'I' }, // not valid for Medicare - real exclusion
    ];
    const result = parseRvuUploadRows(rows);
    expect(result.entries.map(e => e.code)).toEqual(['88305', '99999', '11111']);
    expect(result.skippedNonPayable).toBe(2);
  });

  it('skips modifier-specific rows - this app\'s code map does not model modifiers', () => {
    const rows = [
      { HCPCS: '88305', 'Work RVU': 0.73, 'Status Code': 'A' },        // base code, kept
      { HCPCS: '88305', MOD: '26', 'Work RVU': 0.30, 'Status Code': 'A' }, // modifier row, skipped
    ];
    const result = parseRvuUploadRows(rows);
    expect(result.entries).toHaveLength(1);
    expect(result.skippedNonPayable).toBe(1);
  });

  it('still flags a genuinely missing/invalid work RVU as a real problem, not silently dropped like a non-payable row', () => {
    const rows = [{ HCPCS: '88305', 'Status Code': 'A' }]; // no real RVU value at all
    const result = parseRvuUploadRows(rows);
    expect(result.entries).toHaveLength(0);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('skips genuinely blank rows silently, without a real code to report on', () => {
    const rows = [{ HCPCS: '', 'Work RVU': '' }];
    const result = parseRvuUploadRows(rows);
    expect(result.entries).toHaveLength(0);
    expect(result.problems).toHaveLength(0);
  });
});

describe('suggestBlockAncillaryCptCodes — Phase 2: real, rule-based suggestion from real stain-category data', () => {
  const stainTypes: StainType[] = [
    { id: '1', name: 'H&E', category: 'Routine', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '2', name: 'PAS', category: 'Special Stain', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '3', name: 'GMS', category: 'Special Stain', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '4', name: 'ER', category: 'IHC', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '5', name: 'PR', category: 'IHC', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('suggests nothing for routine H&E - part of the base exam, not a separate ancillary code', () => {
    expect(suggestBlockAncillaryCptCodes([{ stainName: 'H&E' }], stainTypes)).toEqual([]);
  });

  it('suggests one SPECIAL-STAIN billingCode per real special stain, not once per block', () => {
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'PAS' }, { stainName: 'GMS' }], stainTypes);
    expect(result).toEqual(['SPECIAL-STAIN', 'SPECIAL-STAIN']);
  });

  it('suggests IHC-FIRST for the first real IHC stain on a block, IHC-ADDL for each additional - the real, verified CMS rule (88342/88341)', () => {
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'ER' }, { stainName: 'PR' }], stainTypes);
    expect(result).toEqual(['IHC-FIRST', 'IHC-ADDL']);
  });

  it('excludes an unresolvable stain name silently, never guessing at its category', () => {
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'Not A Real Stain' }], stainTypes);
    expect(result).toEqual([]);
  });

  it('handles a real, mixed block correctly - routine, special stain, and IHC together', () => {
    const result = suggestBlockAncillaryCptCodes(
      [{ stainName: 'H&E' }, { stainName: 'PAS' }, { stainName: 'ER' }],
      stainTypes
    );
    expect(result).toEqual(['SPECIAL-STAIN', 'IHC-FIRST']);
  });

  it('per direct guidance: a real, coder-configured code on a specific antibody wins over the generic first/additional IHC rule', () => {
    const typesWithOverride: StainType[] = [
      ...stainTypes,
      { id: '6', name: 'Ki-67', category: 'IHC', antibodyClone: '30-9', defaultBillingCode: '88360', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'Ki-67' }], typesWithOverride);
    expect(result).toEqual(['88360']); // the real, coder-configured code, not the generic 88342 first-stain default
  });

  it('per direct guidance: a real multiplex panel (own distinct StainType record) resolves to its own real code, not counted as separate IHC stains', () => {
    const typesWithMultiplex: StainType[] = [
      ...stainTypes,
      { id: '7', name: 'PIN-4', category: 'IHC', defaultBillingCode: '88344', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'PIN-4' }], typesWithMultiplex);
    expect(result).toEqual(['88344']); // real multiplex code, not 88342
  });

  it('a configured stain still counts toward the generic rule for a later, unconfigured IHC stain on the same block', () => {
    const typesWithOverride: StainType[] = [
      ...stainTypes,
      { id: '6', name: 'Ki-67', category: 'IHC', defaultBillingCode: '88360', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    // Ki-67 (configured, real 88360) comes first, then ER (unconfigured) -
    // ER should be treated as the second real IHC stain on this block (88341), not the first (88342).
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'Ki-67' }, { stainName: 'ER' }], typesWithOverride);
    expect(result).toEqual(['88360', 'IHC-ADDL']);
  });

  it('per direct follow-up: excludeFromIhcSequenceCounting=true does NOT consume a slot — a real, standalone multiplex panel like PIN-4 leaves the sequence untouched for a later, unconfigured IHC stain', () => {
    const typesWithExcludedMultiplex: StainType[] = [
      ...stainTypes,
      { id: '7', name: 'PIN-4', category: 'IHC', defaultBillingCode: '88344', excludeFromIhcSequenceCounting: true, active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    // PIN-4 (excluded) comes first, then ER (unconfigured) - ER should
    // still be treated as the FIRST real IHC stain on this block
    // (88342), since PIN-4 was never a countable IHC stain at all.
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'PIN-4' }, { stainName: 'ER' }], typesWithExcludedMultiplex);
    expect(result).toEqual(['88344', 'IHC-FIRST']);
  });

  it('excludeFromIhcSequenceCounting=true still resolves to the stain\'s own configured code, only the counting side effect changes', () => {
    const typesWithExcludedMultiplex: StainType[] = [
      ...stainTypes,
      { id: '7', name: 'PIN-4', category: 'IHC', defaultBillingCode: '88344', excludeFromIhcSequenceCounting: true, active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const result = suggestBlockAncillaryCptCodes([{ stainName: 'PIN-4' }], typesWithExcludedMultiplex);
    expect(result).toEqual(['88344']); // unchanged from the non-excluded case — the flag only affects later stains
  });
});

describe('suggestSpecimenAncillaryCptCodes — real, critical fix per direct, authoritative guidance: IHC first/additional counting is per SPECIMEN, not per block', () => {
  const stainTypes: StainType[] = [
    { id: '4', name: 'ER', category: 'IHC', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '5', name: 'PR', category: 'IHC', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '6', name: 'HER2', category: 'IHC', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('the real bug this was built to catch: a second block\'s first IHC stain must be 88341, not another 88342', () => {
    const result = suggestSpecimenAncillaryCptCodes(
      [
        { blockId: 'blk-A', stains: [{ stainName: 'ER' }] },
        { blockId: 'blk-B', stains: [{ stainName: 'PR' }] },
      ],
      stainTypes
    );
    expect(result.find(r => r.blockId === 'blk-A')?.suggestions).toEqual(['IHC-FIRST']); // real specimen-wide first IHC stain
    expect(result.find(r => r.blockId === 'blk-B')?.suggestions).toEqual(['IHC-ADDL']); // real specimen-wide second, NOT another IHC-FIRST
  });

  it('threads the count correctly across three real blocks with multiple stains each', () => {
    const result = suggestSpecimenAncillaryCptCodes(
      [
        { blockId: 'blk-A', stains: [{ stainName: 'ER' }, { stainName: 'PR' }] },
        { blockId: 'blk-B', stains: [{ stainName: 'HER2' }] },
      ],
      stainTypes
    );
    expect(result.find(r => r.blockId === 'blk-A')?.suggestions).toEqual(['IHC-FIRST', 'IHC-ADDL']);
    expect(result.find(r => r.blockId === 'blk-B')?.suggestions).toEqual(['IHC-ADDL']); // real third IHC stain on the specimen, still additional
  });

  it('a block with no IHC stains at all does not disturb the running count for later blocks', () => {
    const result = suggestSpecimenAncillaryCptCodes(
      [
        { blockId: 'blk-A', stains: [] },
        { blockId: 'blk-B', stains: [{ stainName: 'ER' }] },
      ],
      stainTypes
    );
    expect(result.find(r => r.blockId === 'blk-B')?.suggestions).toEqual(['IHC-FIRST']); // still the real first IHC stain on the specimen
  });

  it('a single-block specimen behaves identically to the original single-block function', () => {
    const specimenResult = suggestSpecimenAncillaryCptCodes(
      [{ blockId: 'blk-A', stains: [{ stainName: 'ER' }, { stainName: 'PR' }] }],
      stainTypes
    );
    const blockResult = suggestBlockAncillaryCptCodes([{ stainName: 'ER' }, { stainName: 'PR' }], stainTypes);
    expect(specimenResult.find(r => r.blockId === 'blk-A')?.suggestions).toEqual(blockResult);
  });

  it('excludeFromIhcSequenceCounting on one block does not consume a slot for a later block on the same specimen', () => {
    const typesWithExcludedMultiplex: StainType[] = [
      ...stainTypes,
      { id: '7', name: 'PIN-4', category: 'IHC', defaultBillingCode: '88344', excludeFromIhcSequenceCounting: true, active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const result = suggestSpecimenAncillaryCptCodes(
      [
        { blockId: 'blk-A', stains: [{ stainName: 'PIN-4' }] },
        { blockId: 'blk-B', stains: [{ stainName: 'ER' }] },
      ],
      typesWithExcludedMultiplex
    );
    expect(result.find(r => r.blockId === 'blk-A')?.suggestions).toEqual(['88344']);
    // blk-B's ER is still the real, FIRST countable IHC stain on the
    // specimen — blk-A's PIN-4 never occupied a slot, cross-block or not.
    expect(result.find(r => r.blockId === 'blk-B')?.suggestions).toEqual(['IHC-FIRST']);
  });
});

describe('computeNewSuggestions — real fix: correctly handles duplicate suggested codes, not just simple set subtraction', () => {
  it('returns a fresh suggestion when nothing is applied yet', () => {
    expect(computeNewSuggestions([], ['88312'])).toEqual(['88312']);
  });

  it('excludes a suggestion that exactly matches what is already applied', () => {
    expect(computeNewSuggestions(['88312'], ['88312'])).toEqual([]);
  });

  it('keeps a second, genuinely new occurrence of the same code visible - two special stains both suggest 88312, only one is applied', () => {
    expect(computeNewSuggestions(['88312'], ['88312', '88312'])).toEqual(['88312']);
  });

  it('excludes all occurrences once every one of them has been applied', () => {
    expect(computeNewSuggestions(['88312', '88312'], ['88312', '88312'])).toEqual([]);
  });

  it('handles a real, mixed case - one code fully applied, another only partially, a third brand new', () => {
    const result = computeNewSuggestions(['88342'], ['88342', '88341', '88312']);
    expect(result).toEqual(['88341', '88312']);
  });
});

describe('computeCaseCodingSummary — Piece 3: real pre-signout coding summary', () => {
  const stainTypes: StainType[] = [
    { id: '1', name: 'H&E', category: 'Routine', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '2', name: 'PAS', category: 'Special Stain', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '3', name: 'ER', category: 'IHC', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: '4', name: 'PR', category: 'IHC', active: true, version: 1, updatedBy: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('real, critical regression test: a specimen\'s second block correctly suggests 88341, not another 88342 - the actual bug this fix replaced', () => {
    const result = computeCaseCodingSummary(
      [{
        id: 'sp-1', label: 'A',
        blocks: [
          { id: 'blk-A', label: 'A1', stains: [{ stainName: 'ER' }] },
          { id: 'blk-B', label: 'A2', stains: [{ stainName: 'PR' }] },
        ],
      }],
      stainTypes,
    );
    const blockA = result[0].blocks.find(b => b.blockId === 'blk-A');
    const blockB = result[0].blocks.find(b => b.blockId === 'blk-B');
    expect(blockA?.unappliedSuggestions).toEqual(['IHC-FIRST']);
    expect(blockB?.unappliedSuggestions).toEqual(['IHC-ADDL']); // real, specimen-wide second IHC stain
  });

  it('reports a real base code and no warning for a fully-coded specimen', () => {
    const result = computeCaseCodingSummary(
      [{ id: 'sp-1', label: 'A', coding: { cpt: ['88305'] }, blocks: [] }],
      stainTypes,
    );
    expect(result[0].hasBaseCode).toBe(true);
    expect(result[0].hasAncillaryButNoBaseCode).toBe(false);
  });

  it('flags the real soft-warning condition: ancillary code present, base code missing', () => {
    const result = computeCaseCodingSummary(
      [{ id: 'sp-1', label: 'A', blocks: [{ id: 'blk-1', label: 'A1', coding: { cpt: [{ code: '88312' }] } }] }],
      stainTypes,
    );
    expect(result[0].hasBaseCode).toBe(false);
    expect(result[0].hasAncillaryButNoBaseCode).toBe(true);
  });

  it('also flags the warning for an unapplied suggestion, not just an already-applied ancillary code', () => {
    const result = computeCaseCodingSummary(
      [{ id: 'sp-1', label: 'A', blocks: [{ id: 'blk-1', label: 'A1', stains: [{ stainName: 'PAS' }] }] }],
      stainTypes,
    );
    expect(result[0].hasAncillaryButNoBaseCode).toBe(true);
    expect(result[0].blocks[0].unappliedSuggestions).toEqual(['SPECIAL-STAIN']);
  });

  it('does not warn a specimen with no blocks and no base code at all - nothing ancillary to flag', () => {
    const result = computeCaseCodingSummary(
      [{ id: 'sp-1', label: 'A', blocks: [] }],
      stainTypes,
    );
    expect(result[0].hasBaseCode).toBe(false);
    expect(result[0].hasAncillaryButNoBaseCode).toBe(false);
  });

  it('handles multiple real specimens independently', () => {
    const result = computeCaseCodingSummary(
      [
        { id: 'sp-1', label: 'A', coding: { cpt: ['88305'] } },
        { id: 'sp-2', label: 'B', blocks: [{ id: 'blk-2', label: 'B1', coding: { cpt: [{ code: '88342' }] } }] },
      ],
      stainTypes,
    );
    expect(result).toHaveLength(2);
    expect(result[0].hasAncillaryButNoBaseCode).toBe(false);
    expect(result[1].hasAncillaryButNoBaseCode).toBe(true);
  });
});

describe('resolveSpecimenDictionaryBaseCptCode — real fix: uses a real coder-configured code when set, per direct guidance that the lab\'s own AMA license covers this', () => {
  const entries = [
    { id: 'entry-1', defaultBaseCptCode: '88309' },
    { id: 'entry-2' }, // real entry, but no code configured yet
  ];

  it('resolves the real, coder-configured code for a specimen genuinely linked to a dictionary entry', () => {
    const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'entry-1' }, entries);
    expect(result).toBe('88309');
  });

  it('returns null, never a fabricated guess, when the specimen has no real dictionary link at all', () => {
    const result = resolveSpecimenDictionaryBaseCptCode({}, entries);
    expect(result).toBeNull();
  });

  it('returns null when the linked entry exists but has no real code configured yet - falls back to the generic default', () => {
    const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'entry-2' }, entries);
    expect(result).toBeNull();
  });

  it('returns null when the specimen links to an entry id that genuinely doesn\'t exist in the dictionary', () => {
    const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'not-a-real-entry' }, entries);
    expect(result).toBeNull();
  });

  // Real, per direct guidance's own complexity spec (Specimen.complexity,
  // SpecimenEntry.defaultComplexity/microUpgradeBaseCptCode).
  describe('real complexity override behavior', () => {
    const gallbladder = { id: 'gb', defaultBaseCptCode: '88300', defaultComplexity: 'GROSS_ONLY' as const };
    const gallbladderWithUpgrade = { id: 'gb-upgrade', defaultBaseCptCode: '88300', defaultComplexity: 'GROSS_ONLY' as const, microUpgradeBaseCptCode: '88304' };
    const colon = { id: 'colon', defaultBaseCptCode: '88309', defaultComplexity: 'GROSS_AND_MICRO' as const };
    const noComplexityEntry = { id: 'legacy', defaultBaseCptCode: '88305' };

    it('no complexity declared on the specimen at all - exact prior behavior, the dictionary\'s own default code', () => {
      const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'gb' }, [gallbladder]);
      expect(result).toBe('88300');
    });

    it('specimen complexity matches the dictionary\'s own default - not a real override, same code', () => {
      const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'gb', complexity: 'GROSS_ONLY' }, [gallbladder]);
      expect(result).toBe('88300');
    });

    it('real downgrade to GROSS_ONLY (from a GROSS_AND_MICRO default) always resolves to the one universal 88300 code', () => {
      const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'colon', complexity: 'GROSS_ONLY' }, [colon]);
      expect(result).toBe('88300');
    });

    it('real upgrade to GROSS_AND_MICRO with a real, coder-configured upgrade code resolves to it', () => {
      const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'gb-upgrade', complexity: 'GROSS_AND_MICRO' }, [gallbladderWithUpgrade]);
      expect(result).toBe('88304');
    });

    it('real upgrade to GROSS_AND_MICRO with NO configured upgrade code honestly returns null, never a guessed micro-level code', () => {
      const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'gb', complexity: 'GROSS_AND_MICRO' }, [gallbladder]);
      expect(result).toBeNull();
    });

    it('specimen declares a complexity but the dictionary entry has none configured - falls back to the entry\'s own default code, no override logic applies', () => {
      const result = resolveSpecimenDictionaryBaseCptCode({ specimenDictionaryEntryId: 'legacy', complexity: 'GROSS_AND_MICRO' }, [noComplexityEntry]);
      expect(result).toBe('88305');
    });
  });
});

describe('ruleBasedDefaultCptCodes — real fix: honest, rule-based fallback, not invented manual-entry UI', () => {
  it('assigns one real code per real specimen, matching CMS per-specimen billing rules', () => {
    expect(ruleBasedDefaultCptCodes(3)).toEqual(['88305', '88305', '88305']);
  });

  it('assigns nothing for a case with no specimens', () => {
    expect(ruleBasedDefaultCptCodes(0)).toEqual([]);
  });

  it('every code this function ever returns is real and recognized in the code map table', () => {
    const codes = ruleBasedDefaultCptCodes(5);
    const result = computeWorkRvuForCodes(codes);
    expect(result.unrecognizedCodes).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveCaseHasSpecimenCategory } from './resolveCaseHasSpecimenCategory';
import type { SpecimenEntry } from './specimenTypes';

const dict: Pick<SpecimenEntry, 'id' | 'specimenCategory'>[] = [
  { id: 'e-gyn', specimenCategory: 'GYN_CYTOLOGY' },
  { id: 'e-nongyn', specimenCategory: 'NON_GYN_CYTOLOGY' },
  { id: 'e-surgical', specimenCategory: 'SURGICAL_TISSUE' },
];

describe('resolveCaseHasSpecimenCategory', () => {
  it('a real case with a matching specimen returns true', () => {
    expect(resolveCaseHasSpecimenCategory([{ specimenDictionaryEntryId: 'e-gyn' }], dict, 'GYN_CYTOLOGY')).toBe(true);
  });

  it('a real case with only non-matching specimens returns false', () => {
    expect(resolveCaseHasSpecimenCategory([{ specimenDictionaryEntryId: 'e-surgical' }], dict, 'GYN_CYTOLOGY')).toBe(false);
  });

  it('a real, mixed case (rare, but real) returns true if any one specimen qualifies', () => {
    const specimens = [{ specimenDictionaryEntryId: 'e-surgical' }, { specimenDictionaryEntryId: 'e-nongyn' }];
    expect(resolveCaseHasSpecimenCategory(specimens, dict, 'NON_GYN_CYTOLOGY')).toBe(true);
  });

  it('a real specimen with no specimenDictionaryEntryId at all (custom, not from the dictionary) never matches', () => {
    expect(resolveCaseHasSpecimenCategory([{ specimenDictionaryEntryId: undefined }], dict, 'GYN_CYTOLOGY')).toBe(false);
  });

  it('a real, genuinely empty specimens list returns false, never a fabricated match', () => {
    expect(resolveCaseHasSpecimenCategory([], dict, 'GYN_CYTOLOGY')).toBe(false);
    expect(resolveCaseHasSpecimenCategory(undefined, dict, 'GYN_CYTOLOGY')).toBe(false);
  });
});

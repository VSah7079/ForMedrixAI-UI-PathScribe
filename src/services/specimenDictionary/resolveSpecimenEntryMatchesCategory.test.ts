import { describe, it, expect } from 'vitest';
import { resolveSpecimenEntryMatchesCategory } from './resolveSpecimenEntryMatchesCategory';

describe('resolveSpecimenEntryMatchesCategory', () => {
  it('a real entry with no real specimenCategory at all never matches, regardless of the categories checked', () => {
    expect(resolveSpecimenEntryMatchesCategory(undefined, ['AUTOPSY'])).toBe(false);
    expect(resolveSpecimenEntryMatchesCategory({ specimenCategory: undefined }, ['AUTOPSY'])).toBe(false);
  });

  it('a real entry whose real specimenCategory is in the real, checked list matches', () => {
    expect(resolveSpecimenEntryMatchesCategory({ specimenCategory: 'AUTOPSY' }, ['AUTOPSY'])).toBe(true);
  });

  it('a real entry whose real specimenCategory is NOT in the real, checked list does not match', () => {
    expect(resolveSpecimenEntryMatchesCategory({ specimenCategory: 'SURGICAL_TISSUE' }, ['AUTOPSY'])).toBe(false);
  });

  it('a real, multi-category check (e.g. cytologyRelevant\u2019s own real GYN-or-non-GYN check) matches on any one of them', () => {
    expect(resolveSpecimenEntryMatchesCategory({ specimenCategory: 'GYN_CYTOLOGY' }, ['GYN_CYTOLOGY', 'NON_GYN_CYTOLOGY'])).toBe(true);
    expect(resolveSpecimenEntryMatchesCategory({ specimenCategory: 'NON_GYN_CYTOLOGY' }, ['GYN_CYTOLOGY', 'NON_GYN_CYTOLOGY'])).toBe(true);
    expect(resolveSpecimenEntryMatchesCategory({ specimenCategory: 'AUTOPSY' }, ['GYN_CYTOLOGY', 'NON_GYN_CYTOLOGY'])).toBe(false);
  });
});

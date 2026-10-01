import { describe, it, expect } from 'vitest';
import { resolveCaseDisciplineBranch } from './resolveCaseDisciplineBranch';
import type { SpecimenEntry } from './specimenTypes';

const dict: Pick<SpecimenEntry, 'id' | 'specimenCategory'>[] = [
  { id: 'e-gyn', specimenCategory: 'GYN_CYTOLOGY' },
  { id: 'e-nongyn', specimenCategory: 'NON_GYN_CYTOLOGY' },
  { id: 'e-surgical', specimenCategory: 'SURGICAL_TISSUE' },
];

describe('resolveCaseDisciplineBranch', () => {
  it('a real autopsy case is classified as autopsy, regardless of its own specimens', () => {
    expect(resolveCaseDisciplineBranch([{ specimenDictionaryEntryId: 'e-surgical' }], dict, true)).toBe('autopsy');
  });

  it('a real GYN cytology case (no autopsy) is classified as cytology', () => {
    expect(resolveCaseDisciplineBranch([{ specimenDictionaryEntryId: 'e-gyn' }], dict, false)).toBe('cytology');
  });

  it('a real non-GYN cytology case (no autopsy) is classified as cytology', () => {
    expect(resolveCaseDisciplineBranch([{ specimenDictionaryEntryId: 'e-nongyn' }], dict, false)).toBe('cytology');
  });

  it('a real, ordinary surgical case (no autopsy, no cytology) is the real remainder bucket: surgpath', () => {
    expect(resolveCaseDisciplineBranch([{ specimenDictionaryEntryId: 'e-surgical' }], dict, false)).toBe('surgpath');
  });

  it('a real case with no specimens at all and no autopsy defaults to the real remainder bucket, never a fabricated classification', () => {
    expect(resolveCaseDisciplineBranch([], dict, false)).toBe('surgpath');
    expect(resolveCaseDisciplineBranch(undefined, dict, false)).toBe('surgpath');
  });

  it('autopsy takes precedence over a real, genuinely mixed case (rare, but real)', () => {
    expect(resolveCaseDisciplineBranch([{ specimenDictionaryEntryId: 'e-gyn' }], dict, true)).toBe('autopsy');
  });
});

// src/services/cytology/resolveCaseCytologyWorklistMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCaseCytologyWorklistMembership } from './resolveCaseCytologyWorklistMembership';

const DICTIONARY = [
  { id: 'sp-cyto-pap', type: 'Cytology', isGynCytology: true },
  { id: 'sp-cyto-nongyn', type: 'Cytology', isGynCytology: undefined },
  { id: 'sp-fna-thyroid', type: 'FNA', isGynCytology: undefined },
  { id: 'sp-breast-core-biopsy', type: 'Biopsy', isGynCytology: undefined },
  { id: 'sp-cyto-hpv-self', type: 'Cytology', isGynCytology: true, isSelfCollected: true },
];

describe('resolveCaseCytologyWorklistMembership', () => {
  it('no specimens at all — never a member', () => {
    expect(resolveCaseCytologyWorklistMembership(undefined, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(false);
    expect(resolveCaseCytologyWorklistMembership([], DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(false);
  });

  it('a real GYN Pap specimen is always a member, regardless of the non-GYN routing setting', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap' }];
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(true);
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'cytology_worklist', 'co_testing')).toBe(true);
  });

  it('a real non-GYN cytology specimen follows the effective routing setting', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-nongyn' }];
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(false);
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'cytology_worklist', 'co_testing')).toBe(true);
  });

  it('a real FNA specimen follows the effective routing setting, same as any other non-GYN cytology', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-fna-thyroid' }];
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(false);
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'cytology_worklist', 'co_testing')).toBe(true);
  });

  it('a real, ordinary surgical pathology specimen is never a member, regardless of the setting', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-breast-core-biopsy' }];
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'cytology_worklist', 'co_testing')).toBe(false);
  });

  it('a real, mixed case (one surgical specimen + one GYN cytology specimen) is a member — any one qualifying specimen is enough', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-breast-core-biopsy' }, { specimenDictionaryEntryId: 'sp-cyto-pap' }];
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(true);
  });

  it('an unresolvable specimenDictionaryEntryId is safely never a member — no fabricated match', () => {
    const specimens = [{ specimenDictionaryEntryId: 'does-not-exist' }];
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'cytology_worklist', 'co_testing')).toBe(false);
  });

  it('a specimen with no specimenDictionaryEntryId at all is safely never a member', () => {
    const specimens = [{ specimenDictionaryEntryId: undefined }];
    expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'cytology_worklist', 'co_testing')).toBe(false);
  });

  describe('real, per direct guidance\'s own "HPV-First" triage gating', () => {
    it('under primary_hpv_reflex, a case with no HPV result yet is NOT a member — no slide should exist before triage', () => {
      const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap' }];
      expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
    });

    it('under primary_hpv_reflex, a real Negative HPV result is NOT a member — no reflex cytology is ever performed', () => {
      const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvResult: 'Negative' } }];
      expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
    });

    it('under primary_hpv_reflex, a real Positive HPV result genuinely IS a member — reflex triggered', () => {
      const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvResult: 'Positive' } }];
      expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(true);
    });

    it('under co_testing (the real default), the same case is a member with no HPV result at all — the triage gate simply does not apply', () => {
      const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap' }];
      expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(true);
    });

    it('a real, per direct guidance\'s own Australia/NZ NCSP rule: a Positive result on a SELF-collected specimen is NEVER a worklist member — reflex from that specimen is clinically impossible', () => {
      const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-hpv-self', cytologyScreening: { hpvResult: 'Positive' } }];
      expect(resolveCaseCytologyWorklistMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
    });
  });
});

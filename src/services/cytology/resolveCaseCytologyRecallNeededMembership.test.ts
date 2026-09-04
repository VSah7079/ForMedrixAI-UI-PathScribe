// src/services/cytology/resolveCaseCytologyRecallNeededMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCaseCytologyRecallNeededMembership } from './resolveCaseCytologyRecallNeededMembership';

const DICTIONARY = [
  { id: 'sp-cyto-pap', type: 'Cytology', isGynCytology: true },
  { id: 'sp-cyto-hpv-self', type: 'Cytology', isGynCytology: true, isSelfCollected: true },
];

describe('resolveCaseCytologyRecallNeededMembership — real, per direct guidance\'s own Australia/NZ NCSP recall rule', () => {
  it('under co_testing, never a member — this real state only exists under primary_hpv_reflex', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-hpv-self', cytologyScreening: { hpvResult: 'Positive' } }];
    expect(resolveCaseCytologyRecallNeededMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(false);
  });

  it('a real Positive result on a self-collected specimen genuinely IS a member — the recall recommendation this state exists for', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-hpv-self', cytologyScreening: { hpvResult: 'Positive' } }];
    expect(resolveCaseCytologyRecallNeededMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(true);
  });

  it('a real Positive result on a CLINICIAN-collected specimen is never a member here — that case belongs on the real screening worklist instead, not this one', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvResult: 'Positive' } }];
    expect(resolveCaseCytologyRecallNeededMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });

  it('a real Negative result on a self-collected specimen is never a member — no recall needed, routine recall applies same as any negative', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-hpv-self', cytologyScreening: { hpvResult: 'Negative' } }];
    expect(resolveCaseCytologyRecallNeededMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });

  it('a self-collected specimen still awaiting its result is never a member — recall is only ever needed once a real Positive result exists', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-hpv-self' }];
    expect(resolveCaseCytologyRecallNeededMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });

  it('no specimens at all — never a member', () => {
    expect(resolveCaseCytologyRecallNeededMembership(undefined, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });
});

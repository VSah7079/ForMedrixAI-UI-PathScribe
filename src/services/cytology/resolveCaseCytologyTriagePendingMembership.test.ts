// src/services/cytology/resolveCaseCytologyTriagePendingMembership.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCaseCytologyTriagePendingMembership } from './resolveCaseCytologyTriagePendingMembership';

const DICTIONARY = [
  { id: 'sp-cyto-pap', type: 'Cytology', isGynCytology: true },
  { id: 'sp-cyto-hpv-self', type: 'Cytology', isGynCytology: true, isSelfCollected: true },
];

describe('resolveCaseCytologyTriagePendingMembership', () => {
  it('under co_testing, never a member — the triage tile does not apply at all', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap' }];
    expect(resolveCaseCytologyTriagePendingMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'co_testing')).toBe(false);
  });

  it('under primary_hpv_reflex with no HPV result yet: genuinely a member — this is exactly the real case needing triage', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap' }];
    expect(resolveCaseCytologyTriagePendingMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(true);
  });

  it('under primary_hpv_reflex with a real Positive result already recorded: no longer a member — reflex already triggered', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvResult: 'Positive' } }];
    expect(resolveCaseCytologyTriagePendingMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });

  it('under primary_hpv_reflex with a real Negative result already recorded: no longer a member — already resolved, no reflex needed', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-pap', cytologyScreening: { hpvResult: 'Negative' } }];
    expect(resolveCaseCytologyTriagePendingMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });

  it('no specimens at all — never a member', () => {
    expect(resolveCaseCytologyTriagePendingMembership(undefined, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });

  it('a self-collected specimen with a Positive result already recorded: no longer pending triage — it has already resolved to a real, distinct "recall needed" state instead', () => {
    const specimens = [{ specimenDictionaryEntryId: 'sp-cyto-hpv-self', cytologyScreening: { hpvResult: 'Positive' } }];
    expect(resolveCaseCytologyTriagePendingMembership(specimens, DICTIONARY, 'surgical_pathology_worklist', 'primary_hpv_reflex')).toBe(false);
  });
});

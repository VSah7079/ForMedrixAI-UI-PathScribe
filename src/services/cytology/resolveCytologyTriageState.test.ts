// src/services/cytology/resolveCytologyTriageState.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyTriageState, isCytologyScreeningEligible } from './resolveCytologyTriageState';

describe('resolveCytologyTriageState — real, given "HPV-First" triage rules', () => {
  it('co_testing strategy is never gated, regardless of HPV result or collection type', () => {
    expect(resolveCytologyTriageState('co_testing', undefined, false)).toBe('not_applicable');
    expect(resolveCytologyTriageState('co_testing', 'Positive', false)).toBe('not_applicable');
    expect(resolveCytologyTriageState('co_testing', 'Negative', true)).toBe('not_applicable');
  });

  it('real, per direct guidance\'s own German G-BA protocol: cytology_only is also never gated — no HPV testing happens in this real mode at all', () => {
    expect(resolveCytologyTriageState('cytology_only', undefined, false)).toBe('not_applicable');
    expect(resolveCytologyTriageState('cytology_only', 'Positive', false)).toBe('not_applicable');
  });

  it('primary_hpv_reflex with no result yet: awaiting_hpv_result, regardless of collection type', () => {
    expect(resolveCytologyTriageState('primary_hpv_reflex', undefined, false)).toBe('awaiting_hpv_result');
    expect(resolveCytologyTriageState('primary_hpv_reflex', undefined, true)).toBe('awaiting_hpv_result');
  });

  it('primary_hpv_reflex with a Pending or Not Performed result: still awaiting — never assumed eligible', () => {
    expect(resolveCytologyTriageState('primary_hpv_reflex', 'Pending', false)).toBe('awaiting_hpv_result');
    expect(resolveCytologyTriageState('primary_hpv_reflex', 'Not Performed', false)).toBe('awaiting_hpv_result');
  });

  it('primary_hpv_reflex with a real Negative result: hpv_negative_complete — no reflex cytology ever performed, regardless of collection type', () => {
    expect(resolveCytologyTriageState('primary_hpv_reflex', 'Negative', false)).toBe('hpv_negative_complete');
    expect(resolveCytologyTriageState('primary_hpv_reflex', 'Negative', true)).toBe('hpv_negative_complete');
  });

  it('primary_hpv_reflex with a real Positive result, clinician-collected: reflex_triggered — the same specimen becomes eligible', () => {
    expect(resolveCytologyTriageState('primary_hpv_reflex', 'Positive', false)).toBe('reflex_triggered');
  });

  describe('real, per direct guidance\'s own Australia/NZ NCSP self-collection rules', () => {
    it('a real Positive result on a SELF-collected specimen is genuinely distinct — reflex_requires_new_specimen, never reflex_triggered', () => {
      expect(resolveCytologyTriageState('primary_hpv_reflex', 'Positive', true)).toBe('reflex_requires_new_specimen');
    });

    it('the real distinction only applies to a genuinely Positive result — Negative/Pending on a self-collected specimen behave exactly as they would for a clinician-collected one', () => {
      expect(resolveCytologyTriageState('primary_hpv_reflex', 'Negative', true)).toBe('hpv_negative_complete');
      expect(resolveCytologyTriageState('primary_hpv_reflex', undefined, true)).toBe('awaiting_hpv_result');
    });
  });
});

describe('isCytologyScreeningEligible', () => {
  it('not_applicable (co-testing) and reflex_triggered (clinician-collected positive) are both real, genuine eligibility', () => {
    expect(isCytologyScreeningEligible('not_applicable')).toBe(true);
    expect(isCytologyScreeningEligible('reflex_triggered')).toBe(true);
  });

  it('awaiting_hpv_result and hpv_negative_complete are never eligible', () => {
    expect(isCytologyScreeningEligible('awaiting_hpv_result')).toBe(false);
    expect(isCytologyScreeningEligible('hpv_negative_complete')).toBe(false);
  });

  it('reflex_requires_new_specimen (self-collected positive) is genuinely NEVER eligible — a positive self-collected result can never itself produce a screenable slide', () => {
    expect(isCytologyScreeningEligible('reflex_requires_new_specimen')).toBe(false);
  });
});

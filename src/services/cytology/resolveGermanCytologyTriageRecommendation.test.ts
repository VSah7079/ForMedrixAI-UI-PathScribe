// src/services/cytology/resolveGermanCytologyTriageRecommendation.test.ts
import { describe, it, expect } from 'vitest';
import { resolveGermanCytologyTriageRecommendation } from './resolveGermanCytologyTriageRecommendation';

describe('resolveGermanCytologyTriageRecommendation — real, per direct guidance\'s own German G-BA triage rules', () => {
  it('a real Pap I/IIa (rank 0) finding with hrHPV-positive: real, 12-month co-testing recheck', () => {
    expect(resolveGermanCytologyTriageRecommendation('Positive', 0)).toBe('mn3-rec-cotest-12mo');
  });

  it('a real Pap I/IIa finding with HPV-negative (or not performed): no specific real German rule applies', () => {
    expect(resolveGermanCytologyTriageRecommendation('Negative', 0)).toBeUndefined();
    expect(resolveGermanCytologyTriageRecommendation(undefined, 0)).toBeUndefined();
  });

  it('a real IIID1-or-higher finding (rank >= 2): colposcopy, regardless of HPV status', () => {
    expect(resolveGermanCytologyTriageRecommendation('Negative', 2)).toBe('mn3-rec-colposcopy-biopsy');
    expect(resolveGermanCytologyTriageRecommendation(undefined, 5)).toBe('mn3-rec-colposcopy-biopsy');
  });

  it('a real, genuine borderline finding below the IIID1 threshold (rank 1, e.g. Pap II-p) triggers neither real rule on its own', () => {
    expect(resolveGermanCytologyTriageRecommendation('Positive', 1)).toBeUndefined();
    expect(resolveGermanCytologyTriageRecommendation('Negative', 1)).toBeUndefined();
  });

  it('real, deliberate precedence: colposcopy wins even when hrHPV is also positive at rank >= 2 — never superseded by the milder recheck rule', () => {
    expect(resolveGermanCytologyTriageRecommendation('Positive', 4)).toBe('mn3-rec-colposcopy-biopsy');
  });

  it('an undefined rank is treated as rank 0, never assumed abnormal', () => {
    expect(resolveGermanCytologyTriageRecommendation('Positive', undefined)).toBe('mn3-rec-cotest-12mo');
  });
});

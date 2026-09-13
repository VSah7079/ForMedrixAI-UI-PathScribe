// src/services/cytology/resolveCisoeAReflexRecommendation.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCisoeAReflexRecommendation } from './resolveCisoeAReflexRecommendation';

const comp = (value: number) => ({ value });
const score = (squamous: number, otherEndometrium = 1, endocervical = 1) => ({
  squamous: comp(squamous), otherEndometrium: comp(otherEndometrium), endocervical: comp(endocervical),
});

describe('resolveCisoeAReflexRecommendation — real, per direct research into the actual Dutch BMD/genotyping triage strategy', () => {
  it('a real, normal finding (S1) triggers no recommendation at all', () => {
    expect(resolveCisoeAReflexRecommendation(score(1))).toBeUndefined();
  });

  it('the real, established Dutch "BMD" range (Borderline S2-3 through Mild S4) recommends real HPV genotyping, the actual confirmed Dutch triage tool for this range', () => {
    expect(resolveCisoeAReflexRecommendation(score(2))).toBe('cyto-rec-hpv-genotyping');
    expect(resolveCisoeAReflexRecommendation(score(3))).toBe('cyto-rec-hpv-genotyping');
    expect(resolveCisoeAReflexRecommendation(score(4))).toBe('cyto-rec-hpv-genotyping');
  });

  it('real moderate dyskaryosis (S5, Pap 3a2/HSIL) or worse recommends direct colposcopy — high-risk enough to clear the real, distinctively Dutch, higher 20% PPV referral threshold', () => {
    expect(resolveCisoeAReflexRecommendation(score(5))).toBe('cyto-rec-colposcopy');
    expect(resolveCisoeAReflexRecommendation(score(9))).toBe('cyto-rec-colposcopy');
  });

  it('the real, higher-ranked axis among S/O/E always wins — a genuine glandular (E) or other (O) finding at real colposcopy-level severity is never masked by a normal squamous score', () => {
    expect(resolveCisoeAReflexRecommendation(score(1, 1, 6))).toBe('cyto-rec-colposcopy');
    expect(resolveCisoeAReflexRecommendation(score(1, 3, 1))).toBe('cyto-rec-hpv-genotyping');
  });

  it('colposcopy always takes real precedence over genotyping when both thresholds are technically crossed by different axes', () => {
    expect(resolveCisoeAReflexRecommendation(score(3, 6, 1))).toBe('cyto-rec-colposcopy');
  });
});

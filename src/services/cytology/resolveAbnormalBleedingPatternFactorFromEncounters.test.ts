// src/services/cytology/resolveAbnormalBleedingPatternFactorFromEncounters.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAbnormalBleedingPatternFactorFromEncounters } from './resolveAbnormalBleedingPatternFactorFromEncounters';

describe('resolveAbnormalBleedingPatternFactorFromEncounters — real, per direct follow-up ("we should be capturing inbound ICDs")', () => {
  it('a real patient with NO encounter diagnosis data anywhere gets an honest undefined, never a fabricated false', () => {
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([])).toBeUndefined();
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([{ diagnoses: [] }])).toBeUndefined();
  });

  it('real diagnosis data with no qualifying code resolves to a real, positive false — not undefined', () => {
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([{ diagnoses: [{ code: 'E11.9' }] }])).toBe(false);
  });

  it('a real postcoital/contact bleeding code (N93.0) correctly triggers true', () => {
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([{ diagnoses: [{ code: 'N93.0' }] }])).toBe(true);
  });

  it('a real, unspecified abnormal uterine/vaginal bleeding code (N93.9) correctly triggers true', () => {
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([{ diagnoses: [{ code: 'N93.9' }] }])).toBe(true);
  });

  it('the real postmenopausal bleeding code (N95.0) correctly triggers true', () => {
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([{ diagnoses: [{ code: 'N95.0' }] }])).toBe(true);
  });

  it('a real, different N95 subcode (an unrelated menopausal condition, not bleeding) does NOT trigger — the exact N95.0 match is deliberately narrower than the whole N95 family', () => {
    // N95.1 = menopausal and female climacteric states (vasomotor
    // symptoms) — a real, genuinely different condition.
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([{ diagnoses: [{ code: 'N95.1' }] }])).toBe(false);
  });

  it('code matching is case-insensitive', () => {
    expect(resolveAbnormalBleedingPatternFactorFromEncounters([{ diagnoses: [{ code: 'n93.0' }] }])).toBe(true);
  });
});

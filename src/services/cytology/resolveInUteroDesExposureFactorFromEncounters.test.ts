// src/services/cytology/resolveInUteroDesExposureFactorFromEncounters.test.ts
import { describe, it, expect } from 'vitest';
import { resolveInUteroDesExposureFactorFromEncounters } from './resolveInUteroDesExposureFactorFromEncounters';

describe('resolveInUteroDesExposureFactorFromEncounters — real, per direct follow-up ("we should be capturing inbound ICDs")', () => {
  it('a real patient with NO encounter diagnosis data anywhere gets an honest undefined, never a fabricated false', () => {
    expect(resolveInUteroDesExposureFactorFromEncounters([])).toBeUndefined();
    expect(resolveInUteroDesExposureFactorFromEncounters([{ diagnoses: [] }])).toBeUndefined();
  });

  it('real diagnosis data with no qualifying code resolves to a real, positive false — not undefined', () => {
    expect(resolveInUteroDesExposureFactorFromEncounters([{ diagnoses: [{ code: 'Z87.891' }] }])).toBe(false);
  });

  it('the real, exact DES exposure code (Z91.B) correctly triggers true', () => {
    expect(resolveInUteroDesExposureFactorFromEncounters([{ diagnoses: [{ code: 'Z91.B' }] }])).toBe(true);
  });

  it('a real, different, third-generation DES code (Z84.A — family history, not the patient\'s own exposure) does NOT trigger true — a genuinely different real code, never conflated', () => {
    expect(resolveInUteroDesExposureFactorFromEncounters([{ diagnoses: [{ code: 'Z84.A' }] }])).toBe(false);
  });

  it('code matching is case-insensitive', () => {
    expect(resolveInUteroDesExposureFactorFromEncounters([{ diagnoses: [{ code: 'z91.b' }] }])).toBe(true);
  });
});

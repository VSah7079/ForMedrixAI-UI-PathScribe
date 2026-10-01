// src/services/cytology/resolvePriorCervicalProcedureFactorFromEncounters.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePriorCervicalProcedureFactorFromEncounters } from './resolvePriorCervicalProcedureFactorFromEncounters';

describe('resolvePriorCervicalProcedureFactorFromEncounters — real, per direct follow-up ("we should be capturing inbound ICDs")', () => {
  it('a real patient with NO encounter diagnosis data anywhere gets an honest undefined, never a fabricated false', () => {
    expect(resolvePriorCervicalProcedureFactorFromEncounters([])).toBeUndefined();
    expect(resolvePriorCervicalProcedureFactorFromEncounters([{ diagnoses: [] }])).toBeUndefined();
  });

  it('real diagnosis data that genuinely contains no qualifying code resolves to a real, positive false — not undefined', () => {
    const result = resolvePriorCervicalProcedureFactorFromEncounters([
      { diagnoses: [{ code: 'Z87.891', description: 'Personal history of nicotine dependence' }] },
    ]);
    expect(result).toBe(false);
  });

  it('a real, personal history of cervical dysplasia code (Z87.410 — CIN I/II) correctly triggers true', () => {
    expect(resolvePriorCervicalProcedureFactorFromEncounters([{ diagnoses: [{ code: 'Z87.410' }] }])).toBe(true);
  });

  it('a real, personal history of in-situ cervical neoplasm code (Z86.001 — CIN III/AIS) correctly triggers true', () => {
    expect(resolvePriorCervicalProcedureFactorFromEncounters([{ diagnoses: [{ code: 'Z86.001' }] }])).toBe(true);
  });

  it('a real, different Z86 personal-history code (a different organ site) does not falsely trigger — prefix matching is exact to the specific real code, not the whole Z86 category', () => {
    // Z86.000 = personal history of in-situ neoplasm of BREAST, a
    // genuinely different real code under the same Z86.00 parent.
    expect(resolvePriorCervicalProcedureFactorFromEncounters([{ diagnoses: [{ code: 'Z86.000' }] }])).toBe(false);
  });

  it('code matching is case-insensitive, matching real inbound HL7 data which may arrive in either case', () => {
    expect(resolvePriorCervicalProcedureFactorFromEncounters([{ diagnoses: [{ code: 'z86.001' }] }])).toBe(true);
  });
});

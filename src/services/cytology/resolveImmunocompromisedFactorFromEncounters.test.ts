// src/services/cytology/resolveImmunocompromisedFactorFromEncounters.test.ts
import { describe, it, expect } from 'vitest';
import { resolveImmunocompromisedFactorFromEncounters } from './resolveImmunocompromisedFactorFromEncounters';

describe('resolveImmunocompromisedFactorFromEncounters — real, per direct correction (\"maybe from admission icd codes\")', () => {
  it('a real patient with NO encounter diagnosis data anywhere gets an honest undefined, never a fabricated false', () => {
    expect(resolveImmunocompromisedFactorFromEncounters([])).toBeUndefined();
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [] }])).toBeUndefined();
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: undefined }])).toBeUndefined();
  });

  it('real diagnosis data that genuinely contains no qualifying code resolves to a real, positive false — not undefined', () => {
    const result = resolveImmunocompromisedFactorFromEncounters([
      { diagnoses: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' }] },
    ]);
    expect(result).toBe(false);
  });

  it('a real HIV diagnosis code (B20) correctly triggers true', () => {
    const result = resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'B20' }] }]);
    expect(result).toBe(true);
  });

  it('a real transplant status code (Z94.x) correctly triggers true, including specific subcodes not explicitly listed', () => {
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'Z94.0' }] }])).toBe(true);
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'Z94.4' }] }])).toBe(true);
  });

  it('a real SLE code (M32.x) correctly triggers true across its own real subcodes', () => {
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'M32.10' }] }])).toBe(true);
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'M32.9' }] }])).toBe(true);
  });

  it('a real long-term immunosuppressant use code (Z79.6x) correctly triggers true, but a real, different Z79 long-term drug code does not', () => {
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'Z79.620' }] }])).toBe(true);
    // Real, deliberate specificity check: Z79.4 (long-term insulin use)
    // is a genuinely different real code under the same Z79 parent
    // category and must never be conflated with Z79.6.
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'Z79.4' }] }])).toBe(false);
  });

  it('a real, qualifying code found on any one of several real encounters is enough, even if others carry no qualifying diagnosis', () => {
    const result = resolveImmunocompromisedFactorFromEncounters([
      { diagnoses: [{ code: 'J06.9', description: 'Acute upper respiratory infection' }] },
      { diagnoses: [{ code: 'B20' }] },
    ]);
    expect(result).toBe(true);
  });

  it('code matching is case-insensitive, matching real inbound HL7 data which may arrive in either case', () => {
    expect(resolveImmunocompromisedFactorFromEncounters([{ diagnoses: [{ code: 'b20' }] }])).toBe(true);
  });
});

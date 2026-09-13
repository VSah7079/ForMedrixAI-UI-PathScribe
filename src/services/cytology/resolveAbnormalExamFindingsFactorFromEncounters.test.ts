// src/services/cytology/resolveAbnormalExamFindingsFactorFromEncounters.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAbnormalExamFindingsFactorFromEncounters } from './resolveAbnormalExamFindingsFactorFromEncounters';

describe('resolveAbnormalExamFindingsFactorFromEncounters — real, per direct follow-up ("we should be capturing inbound ICDs")', () => {
  it('a real patient with NO encounter diagnosis data anywhere gets an honest undefined, never a fabricated false', () => {
    expect(resolveAbnormalExamFindingsFactorFromEncounters([])).toBeUndefined();
    expect(resolveAbnormalExamFindingsFactorFromEncounters([{ diagnoses: [] }])).toBeUndefined();
  });

  it('real diagnosis data with no qualifying code resolves to a real, positive false — not undefined', () => {
    expect(resolveAbnormalExamFindingsFactorFromEncounters([{ diagnoses: [{ code: 'E11.9' }] }])).toBe(false);
  });

  it('a real cervical polyp code (N84.1) correctly triggers true', () => {
    expect(resolveAbnormalExamFindingsFactorFromEncounters([{ diagnoses: [{ code: 'N84.1' }] }])).toBe(true);
  });

  it('a real, other noninflammatory cervix disorder code (N88.8) correctly triggers true', () => {
    expect(resolveAbnormalExamFindingsFactorFromEncounters([{ diagnoses: [{ code: 'N88.8' }] }])).toBe(true);
  });

  it('a real, deliberate exclusion: a prior cytology result code (R87.613, HSIL) does NOT trigger this criterion — that is resolvePriorAbnormalPapFactor\'s own real, separate signal, and using it here would be circular', () => {
    expect(resolveAbnormalExamFindingsFactorFromEncounters([{ diagnoses: [{ code: 'R87.613' }] }])).toBe(false);
  });

  it('code matching is case-insensitive', () => {
    expect(resolveAbnormalExamFindingsFactorFromEncounters([{ diagnoses: [{ code: 'n84.1' }] }])).toBe(true);
  });
});

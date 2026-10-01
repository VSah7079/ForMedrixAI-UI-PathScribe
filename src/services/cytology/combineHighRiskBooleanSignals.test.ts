// src/services/cytology/combineHighRiskBooleanSignals.test.ts
import { describe, it, expect } from 'vitest';
import { combineHighRiskBooleanSignals } from './combineHighRiskBooleanSignals';

describe('combineHighRiskBooleanSignals — real, honest combining rule for a criterion split across two independent partial sources', () => {
  it('true if either real source is true, regardless of the other', () => {
    expect(combineHighRiskBooleanSignals(true, false)).toBe(true);
    expect(combineHighRiskBooleanSignals(false, true)).toBe(true);
    expect(combineHighRiskBooleanSignals(true, true)).toBe(true);
    expect(combineHighRiskBooleanSignals(true, undefined)).toBe(true);
    expect(combineHighRiskBooleanSignals(undefined, true)).toBe(true);
  });

  it('false only when BOTH real sources are a genuine, definitive false', () => {
    expect(combineHighRiskBooleanSignals(false, false)).toBe(false);
  });

  it('undefined when one real source is a definitive false but the other is genuinely unknown — a single checked-and-clear half never licenses an overall confident false', () => {
    expect(combineHighRiskBooleanSignals(false, undefined)).toBeUndefined();
    expect(combineHighRiskBooleanSignals(undefined, false)).toBeUndefined();
  });

  it('undefined when both real sources are genuinely unknown', () => {
    expect(combineHighRiskBooleanSignals(undefined, undefined)).toBeUndefined();
  });
});

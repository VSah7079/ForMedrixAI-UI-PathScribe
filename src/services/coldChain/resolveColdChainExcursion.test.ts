// src/services/coldChain/resolveColdChainExcursion.test.ts
import { describe, it, expect } from 'vitest';
import { resolveColdChainExcursion } from './resolveColdChainExcursion';
import type { StorageConditionType } from './IStorageConditionTypeService';

const FROZEN: StorageConditionType = { id: 'sct-frozen-tissue', name: 'Frozen Tissue', maxTemperatureCelsius: -20, active: true, isSystem: true };
const FRESH: StorageConditionType = { id: 'sct-fresh-tissue', name: 'Fresh Tissue', maxTemperatureCelsius: 8, active: true, isSystem: true };

describe('resolveColdChainExcursion — real, per the RFP\'s own stated thresholds', () => {
  it('real, frozen tissue exactly at -20°C is NOT an excursion — the threshold is the boundary, not itself a violation', () => {
    expect(resolveColdChainExcursion(-20, FROZEN)).toBe(false);
  });

  it('real, frozen tissue above -20°C (e.g. -18°C) IS an excursion, per the RFP\'s own stated example', () => {
    expect(resolveColdChainExcursion(-18, FROZEN)).toBe(true);
  });

  it('real, fresh tissue at 8°C is NOT an excursion', () => {
    expect(resolveColdChainExcursion(8, FRESH)).toBe(false);
  });

  it('real, fresh tissue above 8°C (e.g. 9.5°C) IS an excursion, per the RFP\'s own stated example', () => {
    expect(resolveColdChainExcursion(9.5, FRESH)).toBe(true);
  });

  it('real, a reading with no real temperature at all is honestly never an excursion — nothing to compare', () => {
    expect(resolveColdChainExcursion(undefined, FROZEN)).toBe(false);
  });

  it('real, an asset with no real, assigned condition type is honestly never an excursion — nothing to compare against', () => {
    expect(resolveColdChainExcursion(-5, undefined)).toBe(false);
  });

  it('real, a genuine minTemperatureCelsius (when a real condition type actually has one) is also enforced', () => {
    const withMin: StorageConditionType = { ...FROZEN, minTemperatureCelsius: -30 };
    expect(resolveColdChainExcursion(-35, withMin)).toBe(true);
    expect(resolveColdChainExcursion(-25, withMin)).toBe(false);
  });
});

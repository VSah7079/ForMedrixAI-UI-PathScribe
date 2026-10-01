import { describe, it, expect } from 'vitest';
import { calculateAutopsyBodyMassIndex } from './calculateAutopsyBodyMassIndex';

describe('calculateAutopsyBodyMassIndex', () => {
  it('a real, standard weight/height pair produces the real, correct BMI', () => {
    // 70 kg / (1.75 m)^2 = 22.857...
    const result = calculateAutopsyBodyMassIndex(70, 175);
    expect(result).toBeCloseTo(22.857, 2);
  });

  it('a real, zero or negative weight returns undefined, never a fabricated 0', () => {
    expect(calculateAutopsyBodyMassIndex(0, 175)).toBeUndefined();
    expect(calculateAutopsyBodyMassIndex(-5, 175)).toBeUndefined();
  });

  it('a real, zero or negative height returns undefined, never a fabricated Infinity', () => {
    expect(calculateAutopsyBodyMassIndex(70, 0)).toBeUndefined();
    expect(calculateAutopsyBodyMassIndex(70, -10)).toBeUndefined();
  });
});

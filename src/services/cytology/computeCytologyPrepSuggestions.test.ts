import { describe, it, expect } from 'vitest';
import { computeCytologyPrepSuggestions } from './computeCytologyPrepSuggestions';

describe('computeCytologyPrepSuggestions', () => {
  it('returns nothing when no yield has been assessed yet', () => {
    expect(computeCytologyPrepSuggestions({})).toEqual([]);
    expect(computeCytologyPrepSuggestions({ totalVolumeMl: 25 })).toEqual([]);
  });

  it('Low yield: 1 ThinPrep + 1 Direct Smear, no Cell Block', () => {
    const result = computeCytologyPrepSuggestions({ yieldPelletSize: 'Low' });
    expect(result).toEqual(expect.arrayContaining([
      { preparationMethod: 'ThinPrep/Liquid-Based', count: 1 },
      { preparationMethod: 'Direct Smear (Air-Dried)', count: 1 },
    ]));
    expect(result.some(s => s.preparationMethod === 'Cell Block')).toBe(false);
  });

  it('Moderate yield: 1 each of ThinPrep, Cell Block, Direct Smear', () => {
    const result = computeCytologyPrepSuggestions({ yieldPelletSize: 'Moderate' });
    expect(result).toEqual(expect.arrayContaining([
      { preparationMethod: 'ThinPrep/Liquid-Based', count: 1 },
      { preparationMethod: 'Cell Block', count: 1 },
      { preparationMethod: 'Direct Smear (Air-Dried)', count: 1 },
    ]));
  });

  it('High yield, volume unknown: 2 ThinPrep, 1 Cell Block, 1 Direct Smear (no volume bump)', () => {
    const result = computeCytologyPrepSuggestions({ yieldPelletSize: 'High' });
    expect(result).toEqual(expect.arrayContaining([
      { preparationMethod: 'ThinPrep/Liquid-Based', count: 2 },
      { preparationMethod: 'Cell Block', count: 1 },
      { preparationMethod: 'Direct Smear (Air-Dried)', count: 1 },
    ]));
  });

  it('exact worked example from the spec: >20mL + High yield -> 2 ThinPrep, 2 Cell Block, 1 Direct Smear', () => {
    const result = computeCytologyPrepSuggestions({ totalVolumeMl: 21, yieldPelletSize: 'High' });
    expect(result).toEqual(expect.arrayContaining([
      { preparationMethod: 'ThinPrep/Liquid-Based', count: 2 },
      { preparationMethod: 'Cell Block', count: 2 },
      { preparationMethod: 'Direct Smear (Air-Dried)', count: 1 },
    ]));
  });

  it('boundary: exactly 20mL does not trigger the extra Cell Block (threshold is strictly >20)', () => {
    const result = computeCytologyPrepSuggestions({ totalVolumeMl: 20, yieldPelletSize: 'High' });
    const cellBlock = result.find(s => s.preparationMethod === 'Cell Block');
    expect(cellBlock?.count).toBe(1);
  });
});

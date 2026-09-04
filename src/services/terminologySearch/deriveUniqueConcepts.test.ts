// src/services/terminologySearch/deriveUniqueConcepts.test.ts
import { describe, it, expect } from 'vitest';
import { deriveUniqueConcepts, countUniqueConcepts } from './deriveUniqueConcepts';

describe('deriveUniqueConcepts — real, per direct guidance: distinct codes ≠ distinct diagnoses', () => {
  it('the exact worked example given: three retained associations for the same real concept derive to exactly one unique concept', () => {
    const associations = [
      { code: '254837009', system: 'SNOMED' },
      { code: '254837009', system: 'SNOMED' },
      { code: '254837009', system: 'SNOMED' },
    ];
    expect(deriveUniqueConcepts(associations)).toEqual([{ code: '254837009', system: 'SNOMED' }]);
    expect(countUniqueConcepts(associations)).toBe(1);
  });

  it('genuinely distinct concepts are all retained', () => {
    const associations = [
      { code: '254837009', system: 'SNOMED' },
      { code: '109838007', system: 'SNOMED' },
    ];
    expect(countUniqueConcepts(associations)).toBe(2);
  });

  it('the same bare code value in two different real systems is never conflated — genuinely different concepts', () => {
    const associations = [
      { code: '8500/3', system: 'SNOMED' },
      { code: '8500/3', system: 'ICDO' },
    ];
    expect(countUniqueConcepts(associations)).toBe(2);
  });

  it('an empty association list derives to an empty, honest result — never a fabricated default', () => {
    expect(deriveUniqueConcepts([])).toEqual([]);
    expect(countUniqueConcepts([])).toBe(0);
  });

  it('never mutates the input array', () => {
    const associations = [{ code: 'A', system: 'SNOMED' }, { code: 'A', system: 'SNOMED' }];
    const original = [...associations];
    deriveUniqueConcepts(associations);
    expect(associations).toEqual(original);
  });
});

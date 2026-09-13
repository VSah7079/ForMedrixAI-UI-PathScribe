import { describe, it, expect } from 'vitest';
import { resolveUpdatedCodingFromModalSubmission } from './resolveUpdatedCodingFromModalSubmission';

const specimen = (id: string, coding: any = {}) => ({ id, coding });

describe('resolveUpdatedCodingFromModalSubmission', () => {
  it('a real, case-wide ICD code (no specimenId) produces a real, bare code string at the case level', () => {
    const result = resolveUpdatedCodingFromModalSubmission([], [
      { system: 'ICD', code: 'C53.9', display: 'Cervix cancer, unspecified' },
    ]);
    expect(result.newCoding.icd10).toEqual(['C53.9']);
  });

  it('a real, specimen-specific ICD code is attached to that real specimen, never the case-wide list', () => {
    const sp = specimen('spec-1');
    const result = resolveUpdatedCodingFromModalSubmission([sp], [
      { system: 'ICD', code: 'C53.9', display: 'Cervix cancer', specimenId: 'spec-1' },
    ]);
    expect(result.newCoding.icd10).toEqual([]);
    expect(result.updatedSpecimens[0].coding.icd10).toEqual([{ code: 'C53.9', description: 'Cervix cancer' }]);
  });

  it('a real, second, distinct specimen keeps its own, different real diagnosis \u2014 genuinely separate from the first', () => {
    const specA = specimen('spec-A');
    const specB = specimen('spec-B');
    const result = resolveUpdatedCodingFromModalSubmission([specA, specB], [
      { system: 'ICD', code: 'C73', display: 'Thyroid malignant', specimenId: 'spec-A' },
      { system: 'ICD', code: 'D36.10', display: 'Benign lymph node', specimenId: 'spec-B' },
    ]);
    const updatedA = result.updatedSpecimens.find(s => s.id === 'spec-A')!;
    const updatedB = result.updatedSpecimens.find(s => s.id === 'spec-B')!;
    expect(updatedA.coding.icd10).toEqual([{ code: 'C73', description: 'Thyroid malignant' }]);
    expect(updatedB.coding.icd10).toEqual([{ code: 'D36.10', description: 'Benign lymph node' }]);
  });

  it('removing every real ICD10 assignment for a specimen genuinely clears it, not silently preserves the stale value', () => {
    const sp = specimen('spec-1', { icd10: [{ code: 'C53.9', description: 'old' }] });
    const result = resolveUpdatedCodingFromModalSubmission([sp], []); // real, complete resolved set is now empty
    expect(result.updatedSpecimens[0].coding.icd10).toBeUndefined();
  });

  it('a real, untouched specimen with no real coding at all is returned completely unchanged', () => {
    const sp = specimen('spec-1');
    const result = resolveUpdatedCodingFromModalSubmission([sp], []);
    expect(result.updatedSpecimens[0]).toBe(sp); // same real reference, never a needless clone
  });

  it('a real, new CPT code for a specimen is correctly detected as a real addition', () => {
    const sp = specimen('spec-1', { cpt: ['88112'] });
    const result = resolveUpdatedCodingFromModalSubmission([sp], [
      { system: 'CPT', code: '88173', display: '88173', specimenId: 'spec-1' },
      { system: 'CPT', code: '88112', display: '88112', specimenId: 'spec-1' },
    ]);
    expect(result.additionsBySpecimen.get('spec-1')).toEqual(['88173']);
    expect(result.removalsBySpecimen.has('spec-1')).toBe(false);
  });

  it('a real CPT code no longer present in the resolved set is correctly detected as a real removal', () => {
    const sp = specimen('spec-1', { cpt: ['88112', '88173'] });
    const result = resolveUpdatedCodingFromModalSubmission([sp], [
      { system: 'CPT', code: '88112', display: '88112', specimenId: 'spec-1' },
    ]);
    expect(result.removalsBySpecimen.get('spec-1')).toEqual(['88173']);
    expect(result.additionsBySpecimen.has('spec-1')).toBe(false);
  });

  it('a real CPT code with no real specimen target is never applied anywhere \u2014 a CPT code is inherently specimen-specific', () => {
    const sp = specimen('spec-1');
    const result = resolveUpdatedCodingFromModalSubmission([sp], [
      { system: 'CPT', code: '88173', display: '88173' }, // no specimenId
    ]);
    expect(result.updatedSpecimens[0].coding.cpt).toBeUndefined();
  });

  it('a real ICD-O code is attached per-specimen, the same real way ICD10 is', () => {
    const sp = specimen('spec-1');
    const result = resolveUpdatedCodingFromModalSubmission([sp], [
      { system: 'ICD-O', code: '8010/3', display: 'Carcinoma, NOS', specimenId: 'spec-1' },
    ]);
    expect(result.updatedSpecimens[0].coding.icdO).toEqual([{ code: '8010/3', description: 'Carcinoma, NOS' }]);
  });
});

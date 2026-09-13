// src/services/migration/resolveMigrationFieldMapping.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMigrationFieldMapping } from './resolveMigrationFieldMapping';
import type { MigrationFieldMapping } from './IMigrationFieldMappingService';

const mapping = (over: Partial<MigrationFieldMapping>): MigrationFieldMapping => ({
  id: 'm1', sourceSystemName: 'LegacyLIS', sourceFieldName: 'src', targetField: 'patientFirstName',
  category: 'demographics', active: true, ...over,
});

describe('resolveMigrationFieldMapping — real, pure field-mapping transform', () => {
  it('real, a simple scalar mapping applies correctly', () => {
    const result = resolveMigrationFieldMapping(
      { pt_fname: 'Jane' },
      [mapping({ sourceFieldName: 'pt_fname', targetField: 'patientFirstName' })],
    );
    expect(result.draft.patientFirstName).toBe('Jane');
  });

  it('real, multiple source fields mapping to the same real array target field are appended, not overwritten', () => {
    const result = resolveMigrationFieldMapping(
      { snomed_1: 'T-71000', snomed_2: 'M-09623' },
      [
        mapping({ sourceFieldName: 'snomed_1', targetField: 'snomedCodes', category: 'coding' }),
        mapping({ sourceFieldName: 'snomed_2', targetField: 'snomedCodes', category: 'coding' }),
      ],
    );
    expect(result.draft.snomedCodes).toEqual(['T-71000', 'M-09623']);
  });

  it('real, a synoptic_field mapping lands correctly inside the real, open synopticFields bag', () => {
    const result = resolveMigrationFieldMapping(
      { tumor_size: '2.3cm' },
      [mapping({ sourceFieldName: 'tumor_size', targetField: 'Tumor Size', category: 'synoptic_field' })],
    );
    expect(result.draft.synopticFields).toEqual({ 'Tumor Size': '2.3cm' });
  });

  it('real, an inactive mapping is never applied, even if the source field is present', () => {
    const result = resolveMigrationFieldMapping(
      { pt_fname: 'Jane' },
      [mapping({ sourceFieldName: 'pt_fname', targetField: 'patientFirstName', active: false })],
    );
    expect(result.draft.patientFirstName).toBeUndefined();
  });

  it('real, a genuinely unmapped source field is surfaced, never silently dropped without a trace', () => {
    const result = resolveMigrationFieldMapping(
      { pt_fname: 'Jane', legacy_notes: 'unmapped stuff' },
      [mapping({ sourceFieldName: 'pt_fname', targetField: 'patientFirstName' })],
    );
    expect(result.unmappedSourceFields).toEqual(['legacy_notes']);
  });

  it('real, an empty source value is honestly treated as absent, never mapped as a real empty string', () => {
    const result = resolveMigrationFieldMapping(
      { pt_fname: '' },
      [mapping({ sourceFieldName: 'pt_fname', targetField: 'patientFirstName' })],
    );
    expect(result.draft.patientFirstName).toBeUndefined();
    expect(result.unmappedSourceFields).toEqual([]);
  });
});

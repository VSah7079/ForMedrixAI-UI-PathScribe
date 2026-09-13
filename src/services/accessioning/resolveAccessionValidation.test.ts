// src/services/accessioning/resolveAccessionValidation.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAccessionValidation } from './resolveAccessionValidation';
import type { ClinicalHistoryDictionaryEntry } from '../clinicalHistory/IClinicalHistoryDictionaryService';
import type { RecordedClinicalHistoryEntry } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';

const DICT: ClinicalHistoryDictionaryEntry[] = [
  { id: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', displayText: 'Prior Abnormal Cytology', active: true, isSystem: true, sortOrder: 1,
    requiredMetadataSchema: [
      { key: 'prior_accession_number', label: 'Prior Accession Number', type: 'text', required: true },
      { key: 'prior_date', label: 'Prior Date', type: 'date', required: true },
    ] },
];

const VALID_ENTRY: RecordedClinicalHistoryEntry = { historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', metadata: { prior_accession_number: 'CY-1', prior_date: '2024-01-01' } };
const INVALID_ENTRY: RecordedClinicalHistoryEntry = { historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', metadata: { prior_accession_number: 'CY-1' } };

describe('resolveAccessionValidation — real, per the uploaded spec\'s own User Story 5, Acceptance Criteria 1', () => {
  it('real, an accession with no clinical history at all is valid — clinical history is optional, never itself mandatory', () => {
    const result = resolveAccessionValidation([], [{ label: 'A', clinicalHistory: [] }], DICT);
    expect(result.valid).toBe(true);
  });

  it('real, a fully-valid case-level entry, with no specimen-level entries, is valid', () => {
    const result = resolveAccessionValidation([VALID_ENTRY], [{ label: 'A', clinicalHistory: [] }], DICT);
    expect(result.valid).toBe(true);
  });

  it('real, an invalid CASE-level entry is caught and correctly scoped as \'case\'', () => {
    const result = resolveAccessionValidation([INVALID_ENTRY], [{ label: 'A', clinicalHistory: [] }], DICT);
    expect(result.valid).toBe(false);
    expect(result.errors[0].scope).toBe('case');
  });

  it('real, an invalid SPECIMEN-level entry is caught and correctly scoped to that specimen\'s own real label', () => {
    const result = resolveAccessionValidation([], [
      { label: 'A', clinicalHistory: [] },
      { label: 'B', clinicalHistory: [INVALID_ENTRY] },
    ], DICT);
    expect(result.valid).toBe(false);
    expect(result.errors[0].scope).toEqual({ specimenLabel: 'B' });
  });

  it('real, a valid case-level entry alongside an invalid specimen-level entry on a genuinely multi-specimen case surfaces exactly the real, specimen-scoped problem, not a false case-level failure', () => {
    const result = resolveAccessionValidation([VALID_ENTRY], [
      { label: 'A', clinicalHistory: [VALID_ENTRY] },
      { label: 'B', clinicalHistory: [INVALID_ENTRY] },
    ], DICT);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].scope).toEqual({ specimenLabel: 'B' });
  });

  it('real, genuine problems at both case level AND multiple specimens are ALL reported together, not just the first found', () => {
    const result = resolveAccessionValidation([INVALID_ENTRY], [
      { label: 'A', clinicalHistory: [INVALID_ENTRY] },
      { label: 'B', clinicalHistory: [INVALID_ENTRY] },
    ], DICT);
    expect(result.valid).toBe(false);
    // Real, direct verification: one real, missing-field error per
    // real entry (3 total: case, specimen A, specimen B).
    expect(result.errors).toHaveLength(3);
  });
});

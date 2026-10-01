// src/services/clinicalHistory/validateClinicalHistoryAccessionPayload.test.ts
import { describe, it, expect } from 'vitest';
import { validateClinicalHistoryAccessionPayload } from './validateClinicalHistoryAccessionPayload';
import type { ClinicalHistoryDictionaryEntry } from './IClinicalHistoryDictionaryService';
import type { RecordedClinicalHistoryEntry } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';

const DICT: ClinicalHistoryDictionaryEntry[] = [
  { id: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', displayText: 'Prior Abnormal Cytology', active: true, isSystem: true, sortOrder: 1,
    requiredMetadataSchema: [
      { key: 'prior_accession_number', label: 'Prior Accession Number', type: 'text', required: true },
      { key: 'prior_date', label: 'Prior Date', type: 'date', required: true },
    ] },
  { id: 'HX_INACTIVE', categoryCode: 'SYM', displayText: 'Inactive Entry', active: false, isSystem: true, sortOrder: 1, requiredMetadataSchema: [] },
];

describe('validateClinicalHistoryAccessionPayload — real, per the uploaded spec\'s own User Story 2, Acceptance Criteria 3', () => {
  it('real, a fully-valid, dictionary-coded entry with all required metadata passes cleanly', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', metadata: { prior_accession_number: 'CY-23-4521', prior_date: '2024-05-12' } },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('real, a genuine, missing required metadata field is caught and named precisely', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', metadata: { prior_accession_number: 'CY-23-4521' } },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('metadata.prior_date');
  });

  it('real, an unknown history_code is refused, never silently accepted', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: 'HX_DOES_NOT_EXIST', categoryCode: 'PRIOR_PATH', metadata: {} },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Unknown history_code');
  });

  it('real, a genuinely inactive dictionary entry is flagged, not silently accepted', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: 'HX_INACTIVE', categoryCode: 'SYM', metadata: {} },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('inactive');
  });

  it('real, a mismatched category_code (doesn\'t match the real dictionary entry\'s own category) is caught', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'SYM', metadata: { prior_accession_number: 'x', prior_date: '2024-01-01' } },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'category_code')).toBe(true);
  });

  it('real, per direct guidance: a valid unmapped_text_fallback under SYM passes', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: null, categoryCode: 'SYM', unmappedTextFallback: 'patient reports vague pelvic discomfort', metadata: {} },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(true);
  });

  it('real, direct correction verified: an unmapped_text_fallback under a real, non-SYM/SCR category (e.g. MAL_STAGE) is refused', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: null, categoryCode: 'MAL_STAGE', unmappedTextFallback: 'some free text', metadata: {} },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('SYM or SCR');
  });

  it('real, an entry with neither history_code nor unmapped_text_fallback is refused', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: null, categoryCode: 'SYM', metadata: {} },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(false);
  });

  it('real, an entry carrying BOTH history_code and unmapped_text_fallback at once is refused — mutually exclusive by design', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: 'HX_ABNL_CYTO_01', categoryCode: 'PRIOR_PATH', unmappedTextFallback: 'also some text', metadata: { prior_accession_number: 'x', prior_date: '2024-01-01' } },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.valid).toBe(false);
  });

  it('real, multiple genuine problems across multiple entries are ALL reported at once, not just the first', () => {
    const entries: RecordedClinicalHistoryEntry[] = [
      { historyCode: 'HX_DOES_NOT_EXIST', categoryCode: 'PRIOR_PATH', metadata: {} },
      { historyCode: null, categoryCode: 'MAL_STAGE', unmappedTextFallback: 'text', metadata: {} },
    ];
    const result = validateClinicalHistoryAccessionPayload(entries, DICT);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].entryIndex).toBe(0);
    expect(result.errors[1].entryIndex).toBe(1);
  });
});

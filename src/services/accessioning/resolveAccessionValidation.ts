// src/services/accessioning/resolveAccessionValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own User Story 5, Acceptance Criteria
// 1 and 2. Combines validateClinicalHistoryAccessionPayload.ts's own
// real, established validation (Story 2) across BOTH real levels
// clinical history can now live at — Case.order.clinicalHistory
// (case-level, the real, primary default) and every real specimen's
// own, additive Specimen.clinicalHistory (per direct guidance's own
// real LIS/cytology data-modeling follow-up) — into one, real,
// honest accession-wide result. Reuses the same real validation
// function Story 2 already built and tested rather than a second,
// parallel implementation of the same real rule.
// ─────────────────────────────────────────────────────────────────────────────

import { validateClinicalHistoryAccessionPayload } from '../clinicalHistory/validateClinicalHistoryAccessionPayload';
import type { ClinicalHistoryValidationError } from '../clinicalHistory/validateClinicalHistoryAccessionPayload';
import type { ClinicalHistoryDictionaryEntry } from '../clinicalHistory/IClinicalHistoryDictionaryService';
import type { RecordedClinicalHistoryEntry } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';

export interface AccessionScopedValidationError extends ClinicalHistoryValidationError {
  /** Real, per direct guidance's own real case-vs-specimen scoping —
   *  'case' for Case.order.clinicalHistory, or the real specimen's own
   *  label (e.g. 'A', 'B') for a Specimen.clinicalHistory entry, so a
   *  real error can be traced back to exactly where it came from on a
   *  genuinely multi-specimen case. */
  scope: 'case' | { specimenLabel: string };
}

export interface AccessionValidationResult {
  valid: boolean;
  errors: AccessionScopedValidationError[];
}

export function resolveAccessionValidation(
  caseLevelEntries: RecordedClinicalHistoryEntry[],
  specimens: { label: string; clinicalHistory: RecordedClinicalHistoryEntry[] }[],
  dictionary: ClinicalHistoryDictionaryEntry[],
): AccessionValidationResult {
  const errors: AccessionScopedValidationError[] = [];

  const caseResult = validateClinicalHistoryAccessionPayload(caseLevelEntries, dictionary);
  errors.push(...caseResult.errors.map(e => ({ ...e, scope: 'case' as const })));

  for (const specimen of specimens) {
    if (specimen.clinicalHistory.length === 0) continue;
    const specimenResult = validateClinicalHistoryAccessionPayload(specimen.clinicalHistory, dictionary);
    errors.push(...specimenResult.errors.map(e => ({ ...e, scope: { specimenLabel: specimen.label } })));
  }

  return { valid: errors.length === 0, errors };
}

// src/services/clinicalHistory/validateClinicalHistoryAccessionPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own User Story 2, Acceptance Criteria
// 3: "PathScribe evaluates incoming JSON against JSON Schema
// definitions and returns 201 Created or a JSON error payload (422
// Unprocessable Entity) detailing invalid or missing fields for the
// Interface Engine to log." This is that real validation — a pure,
// testable function returning every real problem found, not just the
// first one, so a real 422 response can genuinely detail all of them
// at once rather than forcing the Interface Engine through a
// real, slow fix-one-resubmit-repeat cycle.
//
// Real, per direct guidance's own explicit split (User Story 2's own
// "Maps unmapped free-text to unmapped_text_fallback with an
// appropriate category assignment (SYM or SCR)"): an unmapped-text
// entry is only ever valid under SYM or SCR — the other four real
// categories (RAD_LAB, PRIOR_PATH, MAL_STAGE, HIGH_RISK) carry
// real, structured clinical consequence serious enough that this app
// never accepts them as an un-coded guess.
// ─────────────────────────────────────────────────────────────────────────────

import type { RecordedClinicalHistoryEntry } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';
import type { ClinicalHistoryDictionaryEntry } from './IClinicalHistoryDictionaryService';

export interface ClinicalHistoryValidationError {
  entryIndex: number;
  field: string;
  message: string;
}

export interface ClinicalHistoryValidationResult {
  valid: boolean;
  errors: ClinicalHistoryValidationError[];
}

const UNMAPPED_ALLOWED_CATEGORIES = new Set(['SYM', 'SCR']);

export function validateClinicalHistoryAccessionPayload(
  entries: RecordedClinicalHistoryEntry[],
  dictionary: ClinicalHistoryDictionaryEntry[],
): ClinicalHistoryValidationResult {
  const errors: ClinicalHistoryValidationError[] = [];
  const dictById = new Map(dictionary.map(d => [d.id, d]));

  entries.forEach((entry, entryIndex) => {
    const hasCode = !!entry.historyCode;
    const hasFallback = !!entry.unmappedTextFallback && entry.unmappedTextFallback.trim().length > 0;

    if (!hasCode && !hasFallback) {
      errors.push({ entryIndex, field: 'history_code', message: 'Either history_code or unmapped_text_fallback is required.' });
      return;
    }
    if (hasCode && hasFallback) {
      errors.push({ entryIndex, field: 'history_code', message: 'history_code and unmapped_text_fallback are mutually exclusive — an entry is either dictionary-coded or an honest unmapped fallback, never both.' });
      return;
    }

    if (hasFallback) {
      if (!UNMAPPED_ALLOWED_CATEGORIES.has(entry.categoryCode)) {
        errors.push({ entryIndex, field: 'category_code', message: `unmapped_text_fallback entries must carry category_code SYM or SCR — received "${entry.categoryCode}".` });
      }
      return;
    }

    // hasCode branch — real, dictionary-coded entry.
    const dictEntry = dictById.get(entry.historyCode as string);
    if (!dictEntry) {
      errors.push({ entryIndex, field: 'history_code', message: `Unknown history_code "${entry.historyCode}" — no matching dictionary entry.` });
      return;
    }
    if (!dictEntry.active) {
      errors.push({ entryIndex, field: 'history_code', message: `history_code "${entry.historyCode}" refers to a real, but inactive, dictionary entry.` });
    }
    if (dictEntry.categoryCode !== entry.categoryCode) {
      errors.push({ entryIndex, field: 'category_code', message: `category_code "${entry.categoryCode}" does not match history_code "${entry.historyCode}"'s own real category ("${dictEntry.categoryCode}").` });
    }
    for (const field of dictEntry.requiredMetadataSchema) {
      if (!field.required) continue;
      const value = entry.metadata?.[field.key];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push({ entryIndex, field: `metadata.${field.key}`, message: `Missing required metadata field "${field.key}" for history_code "${entry.historyCode}".` });
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

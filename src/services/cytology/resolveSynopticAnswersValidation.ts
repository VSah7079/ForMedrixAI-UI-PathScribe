// src/services/cytology/resolveSynopticAnswersValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own spec (validationError: "Please
// complete all required synoptic fields") — the one, real place that
// checks a template's own required fields are genuinely answered.
// Pure, so the drawer's own Save button only ever calls this and
// renders the result, never re-deriving "is this field required and
// answered" logic inline.
// ─────────────────────────────────────────────────────────────────────────────

import type { SynopticTemplate } from '@/types/cytology/SynopticTemplate';

export interface SynopticValidationResult {
  valid: boolean;
  /** Real field ids with a real, unmet required-field violation —
   *  empty when valid is true. */
  missingFieldIds: string[];
}

function isAnswered(value: string | string[] | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

export function resolveSynopticAnswersValidation(
  template: SynopticTemplate,
  answers: Record<string, string | string[]>,
): SynopticValidationResult {
  const missingFieldIds: string[] = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.required && !isAnswered(answers[field.id])) missingFieldIds.push(field.id);
    }
  }
  return { valid: missingFieldIds.length === 0, missingFieldIds };
}

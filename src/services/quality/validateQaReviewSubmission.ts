// src/services/quality/validateQaReviewSubmission.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-118. The real, generic validation logic for a QA review submission
// — extracted as a pure function so the Unified QA Review Workbench
// (QaReviewCaptureForm.tsx) has one real, testable source of truth,
// rather than the validation living only inside component state like
// DiscordanceReconciliationModal.tsx's own canSubmitDiscordant.
//
// Real, direct generalization of Discordance's own exact requirement
// (DiscordanceReconciliationModal.tsx's canSubmitDiscordant): a
// discordant outcome always requires delta + severity + rootCause +
// a non-empty narrative comment, with rootCauseNote additionally
// required when rootCause is 'other' — the real, mandatory-narrative
// fix already applied there ("comments.trim() ... previously only
// required when rootCause === 'other'"), carried forward unchanged so
// no activity built on this generic workbench can regress behind that
// fix. Every activity-specific field in the owning QaActivityType's
// own `fields` schema is validated the same way TemplateRenderer.tsx's
// synoptic fields are — a `required: true` field must have a real,
// non-empty answer, regardless of field type.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { QaDiscordanceDelta, QaDiscordanceRootCause, QaDiscordanceSeverity, QaReviewOutcome } from '@/types/quality/QaActivityRecord';

export interface QaReviewSubmissionDraft {
  fieldValues: Record<string, string | string[] | number | undefined>;
  outcome: QaReviewOutcome | '';
  delta?: QaDiscordanceDelta | '';
  severity?: QaDiscordanceSeverity | '';
  rootCause?: QaDiscordanceRootCause | '';
  rootCauseNote?: string;
  comments?: string;
}

export interface QaReviewValidationResult {
  valid: boolean;
  /** Real, per-field validation errors, keyed by the same id the
   *  offending field is known by — either a QaActivityType field id,
   *  or one of the fixed outcome-section keys ('outcome'/'delta'/
   *  'severity'/'rootCause'/'rootCauseNote'/'comments') — so the form
   *  can highlight exactly what's missing, not just refuse to submit. */
  errors: Record<string, string>;
}

function isFieldValueEmpty(value: string | string[] | number | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return value.trim().length === 0;
}

/**
 * Real, per direct guidance (PS-118): validates one review-capture
 * draft against its owning QaActivityType's own field schema, plus the
 * fixed, generic outcome-section requirement every review-with-outcome
 * activity shares. Returns every violation found, not just the first —
 * a reviewer fixing a rejected submission should see everything wrong
 * at once, matching TemplateRenderer.tsx's own real form-validation
 * posture.
 */
export function validateQaReviewSubmission(
  activityType: QaActivityType,
  draft: QaReviewSubmissionDraft,
): QaReviewValidationResult {
  const errors: Record<string, string> = {};

  for (const field of activityType.fields) {
    if (field.required && isFieldValueEmpty(draft.fieldValues[field.id])) {
      errors[field.id] = `${field.label} is required.`;
    }
  }

  if (!draft.outcome) {
    errors.outcome = 'An outcome (concordant or discordant) is required.';
  }

  if (draft.outcome === 'discordant') {
    if (!draft.delta) errors.delta = 'Delta is required for a discordant outcome.';
    if (!draft.severity) errors.severity = 'Severity is required for a discordant outcome.';
    if (!draft.rootCause) errors.rootCause = 'Root cause is required for a discordant outcome.';
    if (!draft.comments || !draft.comments.trim()) {
      errors.comments = 'A narrative comment is required for a discordant outcome.';
    }
    if (draft.rootCause === 'other' && !(draft.rootCauseNote && draft.rootCauseNote.trim())) {
      errors.rootCauseNote = 'A note is required when root cause is "Other".';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

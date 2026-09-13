// src/services/cytologyQc/resolveQcRuleDraftValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("no business logic in the UI") — every
// real validation rule for a QC rule draft lives here, pure and
// tested, so the admin form itself only ever calls this and renders
// the result. Real, deliberate scope: validates the draft's own
// well-formedness (required fields, real numeric ranges) — it does
// NOT judge whether a criteria combination makes clinical sense
// (e.g. a rule matching nothing real), which is a genuinely different,
// harder problem this pass doesn't attempt.
// ─────────────────────────────────────────────────────────────────────────────

import type { NewCytologyQcRule } from './ICytologyQcRuleService';

export interface QcRuleDraftValidationResult {
  valid: boolean;
  errors: string[];
}

export function resolveQcRuleDraftValidation(draft: NewCytologyQcRule): QcRuleDraftValidationResult {
  const errors: string[] = [];

  if (!draft.name.trim()) errors.push('A rule name is required.');
  if (!Number.isFinite(draft.evaluationPriority)) errors.push('Evaluation priority must be a real number.');
  if (!Number.isFinite(draft.slaHours) || draft.slaHours <= 0) errors.push('SLA hours must be a real, positive number.');

  switch (draft.samplingLogic.type) {
    case 'percentage':
      if (draft.samplingLogic.ratePercent < 0.1 || draft.samplingLogic.ratePercent > 100) {
        errors.push('Percentage sampling rate must be between 0.1% and 100%.');
      }
      break;
    case 'interval':
      if (!Number.isInteger(draft.samplingLogic.everyNthCase) || draft.samplingLogic.everyNthCase < 1) {
        errors.push('Interval sampling requires a real, positive whole number for "every Nth case."');
      }
      break;
    case 'fixed_volume':
      if (!Number.isInteger(draft.samplingLogic.firstNCases) || draft.samplingLogic.firstNCases < 1) {
        errors.push('Fixed-volume sampling requires a real, positive whole number of cases.');
      }
      break;
  }

  return { valid: errors.length === 0, errors };
}

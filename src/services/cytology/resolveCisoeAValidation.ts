// src/services/cytology/resolveCisoeAValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own CISOE-A specification, section 4
// ("Validation Rules & Constraint Logic"):
//
// "Mandatory Component Checks: Ensure all 6 distinct components are
// selected before a report can be finalized" — a real, distinct
// completeness rule from every other real nomenclature system in this
// module, which only ever requires a single primary interpretation.
//
// "Inadequate Sample Overrides: If A indicates an unsatisfactory
// sample, the system must either flag the report for review or limit
// permitted values for S and E." Real, deliberate choice: flag for
// review, not hard-block — an otherwise-Unsatisfactory specimen that
// still shows a genuine abnormal finding is still real, reportable
// information, the same real principle Bethesda's own adequacy rule
// already establishes ("any specimen with abnormal cells is
// considered adequate and should be reported"). A hard block would
// silently discard a real, clinically important finding.
// ─────────────────────────────────────────────────────────────────────────────

import type { CisoeAScore } from '@/types/cytology/CisoeAScore';

export interface CisoeAValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function resolveCisoeAValidation(score: Partial<CisoeAScore>): CisoeAValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!score.composition) errors.push('Composition (C) is required.');
  if (!score.inflammation) errors.push('Inflammation (I) is required.');
  if (!score.squamous) errors.push('Squamous (S) is required.');
  if (!score.otherEndometrium) errors.push('Other/Endometrium (O) is required.');
  if (!score.endocervical) errors.push('Endocervical (E) is required.');
  if (!score.adequacy) errors.push('Adequacy (A) is required.');

  if (errors.length === 0 && score.adequacy === 'unsatisfactory') {
    const abnormalOnUnsatisfactory = score.squamous!.value > 1 || score.endocervical!.value > 1;
    if (abnormalOnUnsatisfactory) {
      warnings.push('Adequacy is Unsatisfactory, but Squamous/Endocervical values indicate a real, abnormal finding — flagged for review rather than discarded.');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// src/services/cytology/resolveCytologyRoseDiscrepancy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own explicit link ("linked to the
// rose_discrepancy QC engine trigger") — the real, pure decision that
// determines whether a completed ROSE pass and the eventual, final
// lab adequacy call genuinely disagree, which is what a real caller
// then uses to decide whether to actually call
// resolveNewQcCaseAssignmentFromRoseDiscrepancy.ts
// (services/cytologyQc/) — that function itself takes no adequacy
// data at all, assuming this decision has already been made
// elsewhere; this is that elsewhere.
//
// Real, deliberate scope: compares adequacy only, not the full
// diagnostic impression — this app has no structured, at-the-bedside
// diagnostic category dictionary for ROSE's own free-text
// preliminaryImpression to be compared against a final Bethesda
// category with any real confidence. Adequacy is the one, real,
// structured dimension both sides genuinely share.
//
// Real, both directions matter, not just one: a ROSE call of
// "adequate" that the final lab result found unsatisfactory is a
// real, clinically significant discrepancy — the proceduralist was
// told they had a usable sample when they didn't. The reverse (ROSE
// called inadequate/indeterminate, final came back satisfactory) is
// a real, worth-reviewing discrepancy too, even though less urgent
// procedurally — direct guidance's own spec does not scope this
// trigger to one direction only.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyRoseAdequacyAssessment } from '@/types/cytology/CytologyRoseEvaluation';

export function resolveCytologyRoseDiscrepancy(
  roseAssessment: CytologyRoseAdequacyAssessment,
  finalIsUnsatisfactory: boolean,
): boolean {
  if (roseAssessment === 'adequate' && finalIsUnsatisfactory) return true;
  if ((roseAssessment === 'inadequate' || roseAssessment === 'indeterminate') && !finalIsUnsatisfactory) return true;
  return false;
}

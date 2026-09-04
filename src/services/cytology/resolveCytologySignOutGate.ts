// src/services/cytology/resolveCytologySignOutGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, standard CLIA '88 / CAP sign-out gating: a Cytotechnologist may
// independently issue a final sign-out only under specific, well-defined
// conditions. Per direct guidance's own "Hard System Gating Checks" —
// four real, independent boolean checks; if ANY fails, CT sign-out is
// blocked (pathologist review required) regardless of the others.
//
// Real, deliberate reuse rather than four newly-invented checks:
//   1. Specimen Type    — isGynCytology (SpecimenEntry.isGynCytology, PS-160)
//   2. Diagnostic Severity — the review's own, already-computed
//      requiresPathologistReview (resolveCytologyReviewRequirement,
//      Phase 2) — NILM and its own real sub-findings (including
//      reactive changes, organisms, atrophy) already resolve to false
//      there; every real epithelial abnormality/malignancy already
//      resolves to true. Not recomputed a second, different way here.
//   3. Specimen Adequacy — CytologyCategoryEntry.isUnsatisfactory
//      (PS-154), looked up from the review's own adequacyCategoryIds
//      (real, multi-select — any one unsatisfactory selection blocks).
//   4. Pre-Sign-Out QC/Sampling — isFlaggedForQc, an explicit input
//      this pure function takes rather than derives. Real, honest
//      scoping: the actual QC-selection algorithm (random 10% sample,
//      high-risk-patient targeting) is real, separate, later work —
//      this function only enforces the real, resulting gate once a
//      case IS flagged, whatever mechanism did the flagging. Also
//      covers "High-Risk/High-History Patient (NILM)" from direct
//      guidance's own matrix — that case is blocked via mandatory QC
//      flagging, not a fifth, separate check.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyCategoryEntry } from './ICytologyCategoryService';

export type CytologySignOutBlockReason =
  | 'non_gyn_specimen'
  | 'requires_pathologist_review'
  | 'unsatisfactory_adequacy'
  | 'flagged_for_qc';

export interface CytologySignOutGateResult {
  allowed: boolean;
  /** Every real reason CT sign-out is blocked — deliberately not just
   *  the first one found, so a real UI can explain the complete
   *  picture rather than making the user fix one blocker only to
   *  discover another. Empty when allowed is true. */
  blockedReasons: CytologySignOutBlockReason[];
}

export function resolveCytologySignOutGate(
  review: {
    adequacyCategoryIds?: string[];
    requiresPathologistReview: boolean;
  },
  isGynCytology: boolean,
  isFlaggedForQc: boolean,
  categories: CytologyCategoryEntry[],
): CytologySignOutGateResult {
  const blockedReasons: CytologySignOutBlockReason[] = [];

  // 1. Specimen Type Check — real, per direct guidance: "All non-GYN
  //    specimens require final pathologist sign-out regardless of
  //    whether the interpretation is negative or abnormal."
  if (!isGynCytology) blockedReasons.push('non_gyn_specimen');

  // 2. Diagnostic Severity Check — real, already-computed field, not
  //    a second, independent re-derivation.
  if (review.requiresPathologistReview) blockedReasons.push('requires_pathologist_review');

  // 3. Specimen Adequacy Check — real, per direct guidance: "CAP
  //    guidelines require pathologist confirmation before issuing an
  //    unsatisfactory report." Real, per direct UI-review follow-up:
  //    Adequacy is now a real, multi-select field — ANY selected
  //    category flagged isUnsatisfactory is enough to block, same
  //    "any condition true" disjunction this module already uses
  //    elsewhere. No selections at all is treated as NOT
  //    unsatisfactory here deliberately — absence of an adequacy call
  //    entirely is a real, separate data gap this specific check
  //    isn't responsible for catching.
  const isUnsatisfactory = (review.adequacyCategoryIds ?? []).some(
    id => categories.find(c => c.id === id)?.isUnsatisfactory === true
  );
  if (isUnsatisfactory) blockedReasons.push('unsatisfactory_adequacy');

  // 4. Pre-Sign-Out QC/Sampling Check.
  if (isFlaggedForQc) blockedReasons.push('flagged_for_qc');

  return { allowed: blockedReasons.length === 0, blockedReasons };
}

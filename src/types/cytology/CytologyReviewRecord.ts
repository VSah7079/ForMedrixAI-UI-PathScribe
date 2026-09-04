// src/types/cytology/CytologyReviewRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct correction: "Each review is distinct and persists as
// part of the Case's auditable History." An earlier version of this
// module wrongly modeled every review (the primary screen, each
// secondary screening event, the pathologist's own review) as mutable
// fields directly on Specimen.cytologyScreening — inconsistent with how
// this app already handles a genuine series of distinct, auditable
// events on a case. Checked the real, established pattern before
// rebuilding: AmendmentRecord (services/reports/) is its own, separate,
// independently-persisted, append-only collection queried by caseId,
// never embedded fields on Case; QaActivityRecord (types/quality/) is
// the even more directly analogous "real, immutable review-outcome
// record, created once, queried by case" shape — its own service
// interface's header states the real, deliberate posture plainly:
// "always written, never edited." CytologyReviewRecord follows the
// same real posture, and (see role below) unifies what used to be three
// separate, inconsistent shapes into one real, common record type.
//
// Real, per direct guidance: "the Review is the Diagnosis provided by
// each reviewer, Primary and secondary interpretations and
// Recommendation... The Primary Interpretation is the one of the
// Bethesda interpretations. There is only one Primary Interpretation.
// However, One or more Additional Interpretations can be applied."
//
// Real, per direct UI-review follow-up: "Specimen Adequacy can have
// multiple selection, and each selection should allow for an
// associated free text comment. Additional Interpretations... same.
// Recommendations... same. Primary Interpretation can have only one
// selection, and that selection may have an associated free text
// comment." Every multi-select field below is real, per-item
// {categoryId, comment} pairs, not a bare id array — genuinely
// different from Phase 5's original shape, corrected here directly
// rather than left stale.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per direct correction: the underlying role is always
 *  Cytotechnologist or Pathologist — this distinguishes the real,
 *  different WORKFLOW REASON a given review happened, never a
 *  different credential/participation type. Real, standard role
 *  research behind this vocabulary: Primary Screener, Secondary/QC
 *  Screener (random selection or targeted high-risk), Senior/Lead
 *  Cytotechnologist ("Secondary Reviewer"), and the Diagnostic
 *  Reviewer/Sign-out Pathologist. */
export type CytologyReviewRole =
  | 'primary_screen'
  | 'qc_random_selection'
  | 'qc_targeted_high_risk'
  | 'secondary_reviewer'
  | 'pathologist_review';

/** Real, per direct UI-review follow-up: one dictionary selection
 *  (CytologyCategoryEntry.id) plus its own, real, optional free-text
 *  comment — the shared shape every real multi-select field on this
 *  review uses. */
export interface CytologyCategorySelection {
  categoryId: string;
  comment?: string;
}

export interface CytologyReviewRecord {
  id: string;
  specimenId: string;
  caseId: string;
  role: CytologyReviewRole;

  /** Real, per direct UI-review follow-up: multi-select — references
   *  zero or more CytologyCategoryEntry with section: 'adequacy',
   *  each with its own optional comment (e.g. "Satisfactory" plus a
   *  real quality-indicator note). Corrected from Phase 1/5B's
   *  original single `adequacyCategoryId?: string`. */
  adequacySelections?: CytologyCategorySelection[];
  /** References a CytologyCategoryEntry with section:
   *  'general_categorization'. Optional per Bethesda itself. Single-
   *  select — direct guidance's own multi-select correction named
   *  Adequacy/Additional Interpretations/Recommendations specifically,
   *  not this field. */
  generalCategorizationId?: string;

  /** Real, per direct guidance: exactly ONE Bethesda interpretation —
   *  required on every real review. References a CytologyCategoryEntry
   *  with section: 'interpretation_result' and usage: 'primary' or
   *  'both'. */
  primaryInterpretationId: string;
  /** Real, per direct UI-review follow-up: the one selection above
   *  "may have an associated free text comment." */
  primaryInterpretationComment?: string;
  /** Real, per direct guidance: zero or more additional, co-occurring
   *  Bethesda findings — same dictionary, filtered to usage:
   *  'secondary' or 'both' at the capture UI layer. Real, per direct
   *  UI-review follow-up: each selection carries its own comment. */
  additionalInterpretations?: CytologyCategorySelection[];
  /** Real, per direct guidance: this reviewer's own real, standard
   *  clinical recommendation(s). Real, per direct UI-review follow-up:
   *  each selection carries its own comment. */
  recommendations?: CytologyCategorySelection[];

  /** Real, per the original module's own explicit routing requirement.
   *  A deliberate SNAPSHOT taken at THIS review's own creation, never a
   *  live re-derivation. See resolveCytologyReviewRequirement
   *  (services/cytology/) for the real, shared logic that computes
   *  this. */
  requiresPathologistReview: boolean;

  notes?: string;

  recordedAt: string;
  recordedBy: { userId: string; userName: string };
  /** Real, per direct correction: a review IS editable by its own
   *  author — undefined until a real edit happens, so a never-edited
   *  review stays honestly distinguishable from one that's been
   *  revised since it was first recorded. */
  updatedAt?: string;
}

/**
 * Real, small, shared helper — combines a review's own
 * primaryInterpretationId and additionalInterpretations into one
 * flat array of category ids, the shape resolveCytologyReviewRequirement
 * and resolveCytologyCategorySetConcordance (services/cytology/) both
 * operate on. Kept here, next to the type itself, rather than
 * re-derived ad hoc at every call site.
 */
export function allCytologyInterpretationIds(
  review: Pick<CytologyReviewRecord, 'primaryInterpretationId' | 'additionalInterpretations'>,
): string[] {
  return [review.primaryInterpretationId, ...(review.additionalInterpretations ?? []).map(s => s.categoryId)];
}

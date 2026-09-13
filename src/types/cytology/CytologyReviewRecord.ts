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
import type { CisoeAScore } from './CisoeAScore';

export type CytologyReviewRole =
  | 'primary_screen'
  | 'qc_random_selection'
  | 'qc_targeted_high_risk'
  | 'secondary_reviewer'
  | 'pathologist_review'
  // Real, per direct guidance: post-sign-out peer review mirrors the
  // pre-sign-out QC split exactly ("using both mechanisms... is the
  // standard industry practice") — a genuinely separate real event
  // from every role above, all of which are pre-sign-out. Deliberately
  // NOT reusing 'secondary_reviewer' (already an established,
  // different, pre-sign-out concept — see resolveCytologyReviewerRole.ts).
  | 'post_signout_peer_review_random'
  | 'post_signout_peer_review_targeted';

/** Real, per direct guidance's own CLIA 42 CFR § 493.1274 workload
 *  specification: "how this specific pass was executed" — genuinely
 *  distinct from CytologyReviewRole (who/why) and
 *  Specimen.cytologyScreening.computerAssistedScreening (a specimen-
 *  level tool-availability flag) — this is the real, missing link the
 *  real SCU (Screening Credit Unit) weighting needs to function at
 *  all. See resolveCytologyScuWeight.ts for the real, per-mode weight
 *  table, and resolveCytologyReviewMode.ts for the real, safe default
 *  applied to legacy records with no reviewMode on file. */
export type CytologyReviewMode =
  | 'primary_manual'
  | 'liquid_nongyn'
  | 'fov_assisted'
  | 'fov_manual_rescreen'
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

  /** Real, per direct guidance's own full CISOE-A specification
   *  (types/cytology/CisoeAScore.ts): the real, independently-stored
   *  6-component matrix for a real Dutch CISOE-A/KOPAC-B review. Only
   *  ever populated for a real 'palga_cisoea' review — undefined for
   *  every other real nomenclature system. When present, this is the
   *  real, authoritative source of truth for this review's own
   *  findings; `primaryInterpretationId` above is still populated
   *  (via resolveCisoeAToBethesda.ts, at real review-creation time)
   *  with the real, mapped Bethesda-equivalent specifically so every
   *  existing resolver that reads it (sign-out gating, QA agreement,
   *  report content) keeps working correctly, unmodified — it becomes
   *  a real, derived "translated" value rather than the primary
   *  source of truth for a CISOE-A review specifically. */
  cisoeAScore?: CisoeAScore;

  /** Real, per direct guidance's own CLIA workload specification —
   *  optional, per Pete's own "existing/legacy data doesn't break"
   *  requirement. Undefined on every review recorded before this
   *  phase; resolveCytologyReviewMode.ts applies the real, safe
   *  default rather than every real reader needing its own fallback
   *  logic. */
  reviewMode?: CytologyReviewMode;

  /** Real, per the original module's own explicit routing requirement.
   *  A deliberate SNAPSHOT taken at THIS review's own creation, never a
   *  live re-derivation. See resolveCytologyReviewRequirement
   *  (services/cytology/) for the real, shared logic that computes
   *  this. */
  requiresPathologistReview: boolean;

  notes?: string;

  /** Real, per direct guidance's own confirmed recommendation
   *  (weighing "a formatted text block in Notes" vs. "a discrete
   *  synopticData JSON field" vs. Surgical's own case-level
   *  synopticReports array): a discrete field, tied to the specific
   *  review it belongs to — matches Cytology's own simpler,
   *  single-review-record model rather than introducing a separate
   *  report-instance array Cytology has no other real use for. Real,
   *  per direct guidance's own confirmed migration design: values are
   *  the same real, discrete field values regardless of which
   *  template schema version produced them (plain-string labels
   *  today, i18n labelKey-driven labels once that migration happens)
   *  — only the DISPLAY layer changes with that migration, never this
   *  stored shape. Keyed by the originating template's own field id;
   *  undefined for any review with no real synoptic template
   *  attached. */
  synopticData?: {
    templateId: string;
    answers: Record<string, string | string[]>;
    /** Real, per direct guidance's own confirmed correction: "Instead
     *  of just hiding/showing a warning on the UI side, tie the
     *  checkbox directly to the underlying document metadata." A
     *  dismissible UI banner leaves no real trace once dismissed — a
     *  real, attributable, document-level acknowledgment is required
     *  instead. Undefined means no real acknowledgment has ever been
     *  recorded — the honest default, never assumed given just
     *  because the field hasn't been checked. Real, per this same
     *  guidance's own standard pattern: an explicit checkbox tied to
     *  real workflow state, not an implicit inference from whether a
     *  lexicon entry happens to exist. */
    translationValidationAcknowledgment?: {
      acknowledgedBy: string;
      acknowledgedByName: string;
      acknowledgedAt: string;
      /** Real, per direct guidance's own patient-safety framing — the
       *  exact, real set of unvalidated term keys that were present
       *  AT THE MOMENT of this real acknowledgment, not re-derived
       *  later. If the answers change afterward (a real, different
       *  unvalidated term could appear), this specific acknowledgment
       *  no longer honestly covers the new state — a real caller must
       *  compare this list against the current unvalidated set rather
       *  than trusting the acknowledgment blindly forever. */
      acknowledgedUnvalidatedTermKeys: string[];
    };
  };

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

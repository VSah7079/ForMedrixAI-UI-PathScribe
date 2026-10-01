// src/types/quality/QaActivityRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-113. The real, generic instance record for the review-with-outcome
// archetype (QaActivityType.ts) - the direct generalization of
// ReconciliationRecord.ts, checked field-by-field against that real,
// working type before this was written, not designed from scratch.
//
// Real, structural boundary (see QaActivityType.ts's own header for the
// full reasoning): `outcome` and every discrepancy-detail field below
// are GENERIC to the whole review-with-outcome archetype - fixed,
// structural properties every activity built on this archetype shares,
// by definition of what the archetype is. The activity-SPECIFIC
// comparison data (frozenCategory/finalCategory/frozenDx/finalDx, for
// Discordance specifically) lives in `fieldValues`, keyed against the
// owning QaActivityType's own `fields` schema - never as fixed
// properties here, which would only fit Discordance and nothing else.
//
// Same real "always written, never edited" posture ReconciliationRecord
// already established (renamed from DiscordanceRecord specifically so
// a concordant outcome - proof the mandatory check actually happened -
// has a real record too, not just discordant ones) - carried forward
// unchanged, not revisited.
// ─────────────────────────────────────────────────────────────────────────────

export type QaReviewOutcome = 'concordant' | 'discordant';

/** Identical real values to ReconciliationRecord's own
 *  DiscordanceDelta/DiscordanceSeverity/DiscordanceRootCause - these
 *  are genuinely generic discrepancy-classification concepts (not
 *  frozen/final-specific), confirmed directly: "upgrade/downgrade/
 *  minor variance," "low/medium/high severity," "sampling error/
 *  interpretation error/technical artifact/other" all apply equally
 *  well to a future Cytology-Histology correlation or IHC QC
 *  discrepancy as they do to a frozen/final one. */
export type QaDiscordanceDelta = 'upgrade' | 'downgrade' | 'minor_variance';
export type QaDiscordanceSeverity = 'low' | 'medium' | 'high';
export type QaDiscordanceRootCause = 'sampling_error' | 'interpretation_error' | 'technical_artifact' | 'other';

export interface QaActivityRecord {
  id: string;
  /** Real FK to QaActivityType.id - which activity this record is an
   *  instance of. Replaces the old implicit "this type IS Discordance"
   *  assumption ReconciliationRecord never needed to state, since it
   *  only ever represented one real activity. */
  activityTypeId: string;

  caseId: string;
  /** Optional here, unlike ReconciliationRecord's own required
   *  specimenId - Discordance is always specimen-scoped, but a future
   *  review-with-outcome activity might reasonably be case-level
   *  (mirrors the same real case/specimen/both distinction
   *  DeficiencyType.level already established for a different real
   *  dictionary in this app). */
  specimenId?: string;
  /** Free-text display label - carried forward unchanged from
   *  ReconciliationRecord's own real field (confirmed directly: the
   *  values QualityTab already renders, like "Breast Core Bx," don't
   *  match any real Departments dictionary entry - always
   *  display text, never a formal category). */
  caseType: string;
  /** Real Subspecialty.id - carried forward unchanged. */
  subspecialtyId?: string;

  /** The activity-specific comparison/capture data, keyed by the
   *  owning QaActivityType's own `fields[].id`. For the real Discordance
   *  migration, this is where frozenCategory/finalCategory/frozenDx/
   *  finalDx actually live now - as configured field values, not fixed
   *  properties. Checkboxes need string[]; numeric fields need number;
   *  everything else is string, matching QaReviewFieldType's own real
   *  set. */
  fieldValues: Record<string, string | string[] | number>;

  outcome: QaReviewOutcome;
  /** Every field below is present only when outcome === 'discordant' -
   *  a concordant record has nothing to grade, matching
   *  ReconciliationRecord's own exact posture, unchanged. */
  delta?: QaDiscordanceDelta;
  severity?: QaDiscordanceSeverity;
  rootCause?: QaDiscordanceRootCause;
  /** Required content when rootCause === 'other' - enforced at the
   *  review-capture UI layer (PS-118), not at the type level, same
   *  real reason ReconciliationRecord's own equivalent field already
   *  documented: TypeScript can't cleanly express "required when a
   *  sibling field has a specific value." */
  rootCauseNote?: string;
  /** True whenever severity is 'high' - stored explicitly, not
   *  recomputed on every read, same real reason as
   *  isTeachingOnboardingCase below: "cases needing mandatory
   *  follow-up" needs to be a simple, indexable query everywhere this
   *  record is used. */
  escalationRequired?: boolean;
  /** General narrative explaining the discordance - required by the
   *  review-capture UI whenever outcome is 'discordant', matching
   *  ReconciliationRecord's own real ISO 15189/CAP posture: a
   *  structured category alone was never considered a sufficient
   *  audit trail for a material discordance. */
  comments?: string;

  // ── Real, optional Teaching & Onboarding Feedback - present only ────────
  // ── when the owning QaActivityType has teachingOnboardingEnabled ────────
  // ── true. Deliberately renamed from ReconciliationRecord's own more ─────
  // ── narrowly-academic field names - same real fields, more versatile ────
  // ── vocabulary, per direct guidance. ─────────────────────────────────────
  /** Who authored the original draft this record covers - distinct
   *  from recordedBy (who performed the review itself). Kept as-is
   *  from ReconciliationRecord - already neutral, works equally well
   *  for a resident's draft or a newly-hired attending's draft being
   *  onboarded, never carried the narrow "teaching" connotation to
   *  begin with. */
  draftedBy?: { userId: string; userName: string };
  /** Derived, not independently settable - true whenever draftedBy
   *  exists and is a different person than recordedBy. Renamed from
   *  ReconciliationRecord's own isTeachingCase. */
  isTeachingOnboardingCase?: boolean;
  /** Targeted feedback for the person whose draft is being reviewed,
   *  written by the reviewer - renamed from ReconciliationRecord's own
   *  attendingFeedback specifically because "attending" is a narrow,
   *  academic-medicine-specific term; "reviewer" already matches this
   *  same record's own recordedBy field, so the vocabulary stays
   *  consistent rather than introducing a third term for the same real
   *  role. */
  reviewerFeedback?: string;

  recordedAt: string;
  recordedBy: { userId: string; userName: string };
}

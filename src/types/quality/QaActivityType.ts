// src/types/quality/QaActivityType.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-113. The real, admin-configurable definition of a "review-with-
// outcome" QA activity - what a QA Lead manages in the future
// Configuration Center (PS-115). This is deliberately the FIRST of what
// will be at least two real archetypes (PS-114 covers the structurally
// different supervision/assignment shape, e.g. FPPE/Credentialing) -
// checked directly against real, working code (ReconciliationRecord,
// FppeAssignment, CountersignRecord, IntraoperativeEntry's linkage
// fields) before committing to this shape, rather than designed in the
// abstract. They are NOT variations on one universal record - forcing
// them into a single schema would have distorted at least one of them.
//
// Real, deliberate field-schema mechanism, per direct guidance: mirrors
// `EditorField`/`EditorTemplate` (components/Config/Protocols/
// SynopticEditor.tsx) - the exact, real, proven pattern this app
// already uses to let a schema define arbitrary form fields, rendered
// generically by TemplateRenderer.tsx's own field-type switch, rather
// than one bespoke component per field. Same real field-type set
// (dropdown/radio/checkboxes/numeric/text/longtext) - deliberately
// does NOT carry over `snomed`/`icd`/`markerGroup`, which are real,
// but specific to synoptic pathology reporting, not QA review capture.
//
// Real, important boundary, confirmed against `ReconciliationRecord`'s
// own actual fields: `frozenCategory`/`finalCategory`/`frozenDx`/
// `finalDx` are ACTIVITY-SPECIFIC comparison fields, unique to frozen/
// final correlation - these belong in `fields` below, not as fixed
// properties on the generic record. `outcome` and the discrepancy-
// detail fields (delta/severity/rootCause/comments) are genuinely
// GENERIC to the whole review-with-outcome archetype - every activity
// built on this archetype gets those the same way, by definition of
// what the archetype is. That split is what QaActivityRecord.ts
// encodes structurally, not this file.
// ─────────────────────────────────────────────────────────────────────────────

/** Same real, proven set SynopticEditor.tsx's own `FieldType` already
 *  uses - deliberately identical, not a parallel near-duplicate. */
export type QaReviewFieldType = 'dropdown' | 'radio' | 'checkboxes' | 'numeric' | 'text' | 'longtext';

import type { Jurisdiction } from '@/types/systemConfig';
import type { QaDiscordanceSeverity } from './QaActivityRecord';

/**
 * Real, per direct guidance (PS-115, Story 1.4): which discrepancy
 * classifications on a review-with-outcome record should automatically
 * raise a real deficiency (SpecimenDeficiency, the existing, real
 * Firestore CAPA foundation from a prior sprint — see
 * services/deficiencies/README.md, not a new system invented here).
 * Only meaningful against outcome === 'discordant' records — a
 * concordant outcome never has a severity to check against.
 */
export interface QaCapaTriggerRule {
  /** Which QaDiscordanceSeverity values on a discordant record should
   *  auto-raise a deficiency. Empty/undefined — the real, deliberate
   *  "no auto-trigger" default: a discrepancy is still fully recorded
   *  either way; this only controls whether it ALSO produces a CAPA
   *  record automatically, never whether the discrepancy itself gets
   *  captured. */
  triggerSeverities?: QaDiscordanceSeverity[];
  /** Real FK to DeficiencyType.id — which deficiency type gets raised
   *  when triggerSeverities matches. Required whenever
   *  triggerSeverities is non-empty; enforced at the Configuration
   *  Center UI layer, not the type level, same reason
   *  QaActivityRecord.rootCauseNote's own doc comment already gives
   *  for this app's conditional-requirement fields. */
  deficiencyTypeId?: string;
}

/**
 * Real, per direct guidance (PS-117): the finite set of normalized,
 * pre-computed case signals the generic case-selection engine
 * (resolveQaCaseSelectionContext.ts) can express a targeted rule
 * against. Genuinely admin-configurable — picking any signal here for
 * any QaActivityType requires zero code — but adding a brand-new
 * signal itself (a new kind of case fact nobody's computed yet) is a
 * real, honest code change, the same way it would be in any real rule
 * engine with a finite fact vocabulary. Deliberately NOT a full
 * boolean-expression DSL: the one real, currently-shipped hardcoded
 * condition this generalizes (Discordance's own "does this case have
 * a non-deferred frozen category") is a single boolean fact, not a
 * multi-field expression — building a general expression language
 * against a single known real use case would be speculative, not
 * "generalized."
 */
export type QaCaseSelectionSignal = 'hasNonDeferredFrozenCategory';

/**
 * Real, per direct guidance (PS-117, generalizing Discordance's own
 * hardcoded trigger — see useSignOutWorkflow.ts's real merged-intraop-
 * session check): a targeted-selection rule is satisfied when the
 * named signal is true for the case being considered. Undefined means
 * this activity has no targeted rule at all — it may still be
 * selected via samplingPercentage below, or never automatically
 * selected (fully manual), matching every other real "absence means
 * off" convention in this file.
 */
export interface QaTargetedSelectionRule {
  signal: QaCaseSelectionSignal;
}

export interface QaReviewFieldOption {
  id: string;
  label: string;
}

/** Mirrors `EditorField`'s real shape, minus the synoptic-specific
 *  `snomed`/`icd`/`markerGroup` fields, which have no real meaning for
 *  a QA review field. */
export interface QaReviewFieldDefinition {
  id: string;
  label: string;
  type: QaReviewFieldType;
  required: boolean;
  /** Only meaningful for 'dropdown'/'radio'/'checkboxes' - matches
   *  EditorField's own convention of an always-present, possibly-empty
   *  array rather than an optional one, so a field-type switch never
   *  needs a null check before mapping over it. */
  options: QaReviewFieldOption[];
  hint?: string;
}

export interface QaActivityType {
  id: string;
  name: string;
  description?: string;
  /** Real, per direct guidance's own design decision: two separate
   *  tabs (PS-115), not one list with a per-item disable toggle - a
   *  'standard' activity has no disable control anywhere in the UI at
   *  all, which is what actually prevents a site from disabling
   *  something their own jurisdiction mandates (there's no toggle to
   *  misuse in the first place, not a guarded one). */
  tabScope: 'standard' | 'custom';
  /** Only meaningful when tabScope is 'standard' - which real
   *  jurisdictions this PathScribe-curated activity applies to (e.g.
   *  frozen/final correlation is CAP/ISO-15189-mandated in most of
   *  PS-108's named jurisdictions). A 'custom' activity is never
   *  jurisdiction-scoped - it's the site's own, everywhere they use
   *  PathScribe.
   *  Real fix (PS-115): was `string[]` — untyped against this app's
   *  own real Jurisdiction enum, which is how the seed data below
   *  ended up carrying 'EU'/'UK', neither a real Jurisdiction value
   *  (the real set spells out GB_EW/GB_SCT/GB_NIR and the specific EU
   *  member states this app knows about — BE/NL/DE/FR). Under the old
   *  loose type this compiled fine while silently meaning a UK site
   *  would never see this activity in its own Standard tab at all —
   *  exactly the kind of gap PS-115's own jurisdiction-safety design
   *  exists to prevent. */
  jurisdictions?: Jurisdiction[];
  /** The activity-specific comparison/capture fields - see this
   *  file's own header for why frozenCategory/finalCategory/frozenDx/
   *  finalDx live here for Discordance, not as fixed properties on
   *  QaActivityRecord. */
  fields: QaReviewFieldDefinition[];
  /** Real, per direct guidance's own naming correction ("Teaching-
   *  Onboarding," not just "Teaching" - meant to read as versatile,
   *  not academic-medicine-specific): whether this activity captures
   *  the real, optional Teaching & Onboarding Feedback fields on its
   *  own records (QaActivityRecord.isTeachingOnboardingCase/
   *  draftedBy/reviewerFeedback). Defaults false. True for the real
   *  Discordance migration (matches ReconciliationRecord's own
   *  existing draftedBy/isTeachingCase/attendingFeedback fields) -
   *  deliberately NOT baked into every activity by default, since a
   *  site duplicating an activity for something like Grossing QA has
   *  no real use for resident/new-hire feedback capture. */
  teachingOnboardingEnabled: boolean;
  /** Real provenance - which activity (if any) this was created from
   *  via the real Duplicate action (PS-115, mirroring
   *  SynopticEditor.tsx's own `{...t, id: uid(), name: '${t.name}
   *  (Copy)'}` mechanism). Undefined for an activity authored from
   *  scratch, or for the real, initial Standard-tab seed entries
   *  (Discordance, etc.) that predate the Duplicate feature entirely. */
  duplicatedFromId?: string;
  /**
   * Real, per direct guidance (PS-115, Story 1.2): what fraction of
   * eligible cases should be randomly selected for this activity —
   * same real percentage-sampling convention as
   * Facility.codeReviewSamplingRatePercent/
   * shouldRandomlySampleForCodeReview.ts (billing's own proven
   * pattern), reused for the same real reason rather than a second,
   * parallel sampling concept invented here. Undefined/0 — the real
   * "absence means off" convention every other sampling-rate field in
   * this app already uses — never samples automatically; an activity
   * relying entirely on targeted/manual selection leaves this unset.
   * Storage and admin config only — the actual case-selection logic
   * that consumes this is the Activity Engine's own job (a separate,
   * later ticket), deliberately not built here.
   */
  samplingPercentage?: number;
  /**
   * Real, per direct guidance (PS-117): the generic, admin-configurable
   * targeted-selection condition — see QaTargetedSelectionRule's own
   * doc comment above. Undefined means no targeted rule; an activity
   * can have a targeted rule, a samplingPercentage, both (targeted
   * cases are always selected; the random roll additionally covers
   * cases the targeted rule doesn't catch), or neither (fully manual
   * selection). Storage and admin config only — resolveQaActivity
   * SelectionForCase.ts is what actually evaluates this against a
   * real case.
   */
  targetedSelectionRule?: QaTargetedSelectionRule;
  /** Real, per direct guidance (PS-115, Story 1.4) — see
   *  QaCapaTriggerRule's own doc comment above for the full account. */
  capaTriggerRule?: QaCapaTriggerRule;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

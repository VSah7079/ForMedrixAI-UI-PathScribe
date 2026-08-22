// src/types/quality/ReconciliationRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Renamed from DiscordanceRecord — the old model only ever wrote a record
// when a mismatch was found, so there was no real denominator anywhere
// for a concordance rate (numerator existed, total reviewed didn't). Per
// ISO 15189 / CAP audit-trail expectations, a QA log needs to prove
// process execution (a reconciliation happened) as well as findings (it
// was or wasn't discordant) — a concordant outcome is itself the
// evidence the mandatory frozen/final check actually occurred.
//
// Every reconciliation is now one ReconciliationRecord, always written,
// with outcome distinguishing concordant from discordant. The
// discordance-specific fields (delta/severity/rootCause) are only
// meaningful — and only required — when outcome is 'discordant'.
//
// Deliberately built around discrete categories (FrozenCategory on the
// intraop side, finalCategory here), not free-text diagnosis comparison —
// two short diagnoses can't reliably self-compare for discordance, but
// two categories from the same small set can. The pathologist confirms
// Delta/Severity/Root Cause themselves; none of that is inferred or
// auto-graded.
//
// Real, confirmed guardrail, checked directly against the real,
// itemized PreparationOutput[] model added to IntraopSpecimen
// (types/intraop/IntraoperativeEntry.ts, resolves PS-82 — a single
// specimen can genuinely have multiple, separately-identified
// preparations, e.g. one touch prep AND several frozen blocks): this
// record is keyed by caseId/specimenId, real, per-specimen, and was
// ALREADY that way before PreparationOutput existed — frozenCategory
// here is a single, discrete category tied to one specimen's own
// frozen-section diagnosis, never a block count or a preparation
// count, and DiscordanceReconciliationModal.tsx (the one real place
// this gets created) confirms this end to end: it takes specimenId/
// frozenCategory as real, given props, never derives or requires a
// block-for-block match against the final read. Frozen/final linkage
// stays correctly scoped at the specimen/consultation level regardless
// of how many real preparations (touch preps, multiple frozen blocks)
// a specimen ends up with — nothing here needs to change, or should
// change, as that model evolves further.
// ─────────────────────────────────────────────────────────────────────────────
import type { FrozenCategory } from '../intraop/IntraoperativeEntry';

export type ReconciliationOutcome = 'concordant' | 'discordant';

export type DiscordanceDelta = 'upgrade' | 'downgrade' | 'minor_variance';

/** Mapped onto the existing low/medium/high severity type QualityTab
 *  already renders — Tier 1/2/3 from the clinical framing this was
 *  built from, kept as one system rather than a parallel one.
 *  low = Tier 1 (no clinical impact), medium = Tier 2 (minimal/moderate),
 *  high = Tier 3 (significant — e.g. false negative requiring a second
 *  surgical procedure). Only meaningful when outcome is 'discordant' —
 *  a concordant record has no severity, there's nothing to grade. */
export type DiscordanceSeverity = 'low' | 'medium' | 'high';

export type DiscordanceRootCause = 'sampling_error' | 'interpretation_error' | 'technical_artifact' | 'other';

export interface ReconciliationRecord {
  id: string;
  caseId: string;
  specimenId: string;
  /** Free-text label for display — e.g. the specimen's own label, not a
   *  formal dictionary category (checked directly: the values QualityTab
   *  already shows, like "Breast Core Bx," don't match any real
   *  Specimen Categories dictionary in this app — they're just display text). */
  caseType: string;
  /** Real Subspecialty.id (GI/Breast/Derm/Neuro/etc — see
   *  services/subspecialties/mockSubspecialtyService.ts), derived from
   *  the case's own Case.subspecialtyId at the point of reconciliation.
   *  This is deliberately Subspecialty, not SpecimenCategory — those are
   *  two different, already-real, unrelated axes in this app
   *  (SpecimenCategory governs accession numbering/grossing templates;
   *  Subspecialty is the actual clinical-domain classification this
   *  kind of trainee competency tracking needs). Undefined when the
   *  case itself has no subspecialtyId set. */
  subspecialtyId?: string;
  frozenCategory: FrozenCategory;
  finalCategory: FrozenCategory;
  frozenDx: string;
  finalDx: string;
  outcome: ReconciliationOutcome;
  /** Present only when outcome === 'discordant'. */
  delta?: DiscordanceDelta;
  severity?: DiscordanceSeverity;
  rootCause?: DiscordanceRootCause;
  rootCauseNote?: string; // required content when rootCause === 'other'
  /** True whenever severity is 'high' — stored explicitly (not
   *  recomputed on every read) so "cases needing mandatory follow-up"
   *  is a simple query everywhere this record is used, matching the
   *  same pattern as isTeachingCase below. This flags the need for
   *  escalation/amendment/root-cause review; it does NOT itself send a
   *  notification or create an amendment — that's real, separate
   *  integration work (the LIS notification pathway and Amendment/
   *  Addendum system both already exist elsewhere in this app, just
   *  not wired to fire automatically from this field yet). */
  escalationRequired?: boolean;
  /** General narrative explaining the discordance — required by the UI
   *  (DiscordanceReconciliationModal.tsx) whenever outcome is
   *  'discordant', regardless of which rootCause was picked. Distinct
   *  from rootCauseNote, which is specifically the "other" catch-all's
   *  own explanation field. ISO 15189/CAP audit expectations require an
   *  actual auditable narrative for a material discordance, not just a
   *  dropdown classification — a structured category alone doesn't
   *  explain what a reviewer would actually need to know. Not
   *  enforced at the type level (TypeScript can't cleanly express
   *  "required when a sibling field has a specific value") — enforced
   *  in the modal's own submit-guard instead. */
  comments?: string;
  /** Who authored the original draft this reconciliation covers —
   *  distinct from recordedBy (who performed the reconciliation itself,
   *  typically the attending at sign-out). Populated specifically when
   *  the case has a resident/fellow participant on its team (see
   *  Case.participants[], participationTypeIds including 'resident')
   *  whose draft is what's being reconciled. Undefined for the common
   *  non-teaching path — the same pathologist drafted and is finalizing
   *  their own case, nobody else's work is being reviewed here. */
  draftedBy?: { userId: string; userName: string };
  /** Derived, not independently settable — true whenever draftedBy
   *  exists and is a different person than recordedBy. Kept as an
   *  explicit stored field (not recomputed on every read) so filtering
   *  "show me teaching cases" is a simple equality check everywhere
   *  this record is queried, not a repeated userId comparison. */
  isTeachingCase?: boolean;
  /** Targeted feedback for the trainee, written by the attending —
   *  distinct from comments/rootCauseNote (which explain the
   *  discordance in QMS/regulatory terms). Optional even on a teaching
   *  case; an attending isn't required to write this, just enabled to
   *  capture it in the same modal at sign-out rather than a separate
   *  email later. */
  attendingFeedback?: string;
  recordedAt: string;
  recordedBy: { userId: string; userName: string };
}

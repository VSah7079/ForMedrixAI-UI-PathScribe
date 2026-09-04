// src/types/intraop/IntraoperativeEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real data model for the Intraop Pre-Check capture flow's desktop side —
// the "Unlinked Intraoperative Entries" queue. A session is created at
// the bench, lives here unmerged until a formal LIS accession arrives,
// then gets merged into the real case.
//
// A session != a specimen. One patient, one OR, one surgeon can send
// multiple specimens to the same intraop consult (the mass plus a
// separate margin, multiple sentinel nodes, etc.) — re-scanning the same
// patient and re-entering the same OR/surgeon for each one would be real,
// avoidable friction at a bench, so patient/OR/surgeon are captured once
// per session, and each specimen underneath carries its own milestones,
// Quick Gross, and frozen diagnosis.
//
// Milestones are workflow tracking, not a hard gate — logged in real
// sequence with real timestamps, including explicit skip reasons when a
// step is deliberately bypassed (e.g. "Direct to Frozen" on dense,
// fibrotic tissue that won't yield a usable touch prep). The desktop
// merge screen is where that sequence becomes visible to someone with
// full case context, not a blocking check at capture time — a stressed
// resident at a messy bench should never be locked out of logging the
// next real step. The Quick Gross gate is the one deliberate exception —
// see mockIntraoperativeService's addMilestone for why.
// ─────────────────────────────────────────────────────────────────────────────

export type MilestoneType =
  | 'gross_logged'
  | 'touch_prep_performed'
  | 'touch_prep_skipped'
  | 'frozen_section_cut';

export type SkipReason = 'fibrotic_scant' | 'direct_to_frozen' | 'other';

/** Real, new type, per direct guidance — resolves a real, confirmed gap
 *  (Jira PS-82): milestones[] tracks WORKFLOW SEQUENCE (when a step
 *  happened, was it skipped, why) — it was never meant to be, and
 *  never reliably could be, a real COUNT of what was actually
 *  produced. A single 'frozen_section_cut' milestone tap represents
 *  the workflow step happening at all, not how many physical blocks
 *  were frozen, and a specimen can genuinely have BOTH touch preps AND
 *  frozen blocks, which the old single-tap-per-milestone-type model
 *  had no way to represent as distinct, countable, separately-
 *  identified outputs at all. */
export type PreparationType =
  | 'frozen_block'
  | 'touch_prep'
  | 'squash_prep'
  | 'cytology_fluid'
  | 'gross_only';

/** Real, itemized record of one specific preparation actually
 *  produced at the bench — e.g. one real frozen block, one real touch
 *  prep slide. This, not milestones[], is the real source
 *  suggestFrozenSectionCptCodes() (services/billing/frozenSectionBilling.ts)
 *  counts from — see that file's own header for the full reasoning,
 *  and PreparationOutput[] on IntraopSpecimen below for where these
 *  live per specimen. */
export interface PreparationOutput {
  id: string;
  type: PreparationType;
  /** Real, human-readable identifier for this specific output, e.g.
   *  "FS-A1" for a frozen block or "FS-TP1" for a touch prep slide on
   *  specimen A — matches the real example given directly ("Specimen A
   *  → 1 Touch Prep Slide (FS-TP1) + 1 Frozen Block (FS-A1)").
   *  Auto-generated from the specimen's own label plus a real,
   *  per-type sequence counter (mockIntraoperativeService.ts's own
   *  addPreparationOutput) — never left to free-text entry, so two
   *  outputs of the same type on the same specimen can never
   *  collide. */
  identifier: string;
  timestamp: string;
}

/** Discrete, comparable category — the actual point of this over free
 *  text: two short diagnoses can't reliably self-compare for
 *  discordance, but two categories from the same small set can. 'deferred'
 *  means no real call was made at frozen, so there's nothing to
 *  reconcile against later — not a mismatch, a non-comparison. */
export type FrozenCategory = 'benign' | 'malignant' | 'atypical_suspicious' | 'deferred';

export interface MilestoneEntry {
  id: string;
  milestone: MilestoneType;
  timestamp: string;
  /** Only present on touch_prep_skipped — the "active override" the
   *  clinical case for this design specifically called for: a
   *  conscious 1-tap decision, not a silent skip. */
  skipReason?: SkipReason;
  skipReasonNote?: string; // free text for the 'other' case
}

export interface PatientMatchInfo {
  /** How the patient was identified at the bench — a scanned barcode is
   *  deterministic; an ADT match is a real hospital feed lookup. Both
   *  are meaningfully more reliable than voice-captured MRN, which this
   *  model deliberately doesn't support as a primary identification path. */
  source: 'barcode' | 'adt_match';
  /** Left loosely typed — a real barcode payload or ADT response shape
   *  isn't settled yet; this is what's actually known: name + MRN once
   *  decoded/matched. */
  patientName: string;
  mrn: string;
  /** Only reliably known when a real ADT match happens — when there's
   *  no ADT feed to check against, the barcode gives an MRN but not a
   *  confirmed DOB, so the pathologist enters name + DOB manually
   *  alongside whatever the barcode did provide. Optional for exactly
   *  that reason, not an oversight. */
  dateOfBirth?: string;
  confirmedAt: string;
}

/** A single specimen within a session. Everything specific to *this*
 *  piece of tissue — its own milestone sequence, its own Quick Gross,
 *  its own frozen diagnosis — separate from the session-level patient/
 *  OR/surgeon info that's shared across every specimen in the session. */
export interface IntraopSpecimen {
  id: string;
  /** e.g. "Specimen A: Left breast, margins" */
  specimenLabel: string;
  arrivalTimestamp: string; // TAT baseline, per specimen — different specimens in the same session can arrive at genuinely different moments
  milestones: MilestoneEntry[];
  preliminaryCytologyDictation?: string;
  /** Phase 1 of a real two-phase gross description model — rapid,
   *  high-velocity capture at the bench: dimensions/weight, which
   *  blocks were frozen and from where, orientation/sutures applied by
   *  the surgeon. Not the formal, standard-compliant gross description
   *  — that's Phase 2, finalized later at the desktop after merge, in
   *  the case's own real Gross Description field (cassette mapping,
   *  fixative times, remaining sections for permanent). This field is
   *  the seed the merge pipeline hands to that later step, not the
   *  final text itself. Required before any other milestone can be
   *  logged — see the hard gate in mockIntraoperativeService's
   *  addMilestone — because it's what justifies, clinically, why
   *  specific tissue got frozen in the first place. */
  quickGrossDictation?: string;
  /** The actual diagnostic conclusion reached at frozen section — e.g.
   *  "Invasive carcinoma, margins negative" or "Deferred to permanent."
   *  Deliberately separate from quickGrossDictation (a physical,
   *  descriptive observation, not a diagnosis) and from the session's
   *  verbalReportLog free-text note (what was said to the surgeon,
   *  which may echo this but isn't structured enough to reliably
   *  compare against anything later). This is the field the Frozen-to-
   *  Permanent Reconciliation Gate actually needs — a clean, dedicated
   *  diagnosis to check against the final permanent diagnosis, not
   *  something extracted from mixed-purpose text. */
  frozenSectionDiagnosis?: string;
  /** The discrete category behind the diagnosis text — what actually
   *  makes reconciliation against the final diagnosis reliable later.
   *  See FrozenCategory's doc comment for why. */
  frozenCategory?: FrozenCategory;
  /** Real fix, added for FROZEN_SECTION TAT (turnaround time)
   *  calculation (components/Contribution/qualityCalculations.ts) - the
   *  real gap this closes: the milestones[] array already has a real
   *  'frozen_section_cut' timestamp (tissue cut for frozen), but nothing
   *  captured when the actual diagnostic conclusion was reached, so no
   *  true interval could be computed. Set once, at
   *  setFrozenSectionDiagnosis (mockIntraoperativeService.ts) - the real
   *  moment the diagnosis is actually rendered. */
  frozenDiagnosisRenderedAt?: string;
  /** Real, itemized record of what was actually produced at the bench
   *  for this specimen, per direct guidance — separate from
   *  milestones[] above (workflow-sequence tracking only). A single
   *  specimen can genuinely have multiple, different preparation
   *  outputs — e.g. one touch prep slide AND two frozen blocks — each
   *  with its own real identifier. This is the real source
   *  suggestFrozenSectionCptCodes() counts frozen blocks from
   *  (services/billing/frozenSectionBilling.ts) — resolves PS-82's
   *  real, confirmed gap (counting milestones.length was never
   *  reliable). Genuinely empty for a specimen where nothing has been
   *  logged yet, or for legacy sessions created before this field
   *  existed. */
  preparations: PreparationOutput[];
}

export interface IntraoperativeEntry {
  id: string;
  patientMatch: PatientMatchInfo;
  /** The logged-in user actually running this intraop session — a real
   *  gap until captured: nothing recorded who was performing the case,
   *  which matters for the same reason every other action in this app
   *  is attributed to a real user, not left implicit. Captured once at
   *  session creation from the active login, not re-derived per
   *  specimen — the pathologist covering a case doesn't change mid-way. */
  performedBy: { userId: string; userName: string };
  orNumber: string;
  surgeon: string;
  /** Real feature, per direct confirmation: "Let's wire in Facility
   *  and Location (Room) for Intraop." Same real pattern as
   *  Case.order.facilityId/locationId — captured once per session
   *  (alongside OR/surgeon), not per specimen, since the specimens
   *  under one session all come from the same OR/facility. Optional:
   *  a session can genuinely be started before the facility/location
   *  is known (e.g. barcode-only identification with no ADT match —
   *  see PatientMatchInfo), same honest-absence posture as the rest
   *  of this type. */
  facilityId?: string;
  /** Cached display name — avoids an async lookup on every render,
   *  same reasoning as Case.order.facilityName. */
  facilityName?: string;
  locationId?: string;
  /** Cached display string ("OR-3" / "Ward 3 / 101 / A") — same
   *  reasoning as Case.order.locationDisplay. */
  locationDisplay?: string;
  /** One or more specimens under this same patient/OR/surgeon session. */
  specimens: IntraopSpecimen[];
  /** Session-level — a surgeon typically gets one callback summarizing
   *  findings across every specimen from the case, not a separate call
   *  per specimen. */
  verbalReportLog?: { timestamp: string; note: string };
  status: 'pending' | 'merged';
  /** Set once merged — which real case this session's data was folded into. */
  mergedIntoCaseId?: string;
  mergedAt?: string;
  createdAt: string;
}

/** A candidate real case the queue's matcher thinks this session might
 *  belong to, with the specific reason so the clerk/pathologist doing
 *  the merge can see *why* it was suggested, not just that it was. */
export interface MatchCandidate {
  caseId: string;
  matchType: 'mrn_exact' | 'fuzzy';
  /** e.g. "MRN exact match" or "Last name + surgeon + arrived within 40 min" */
  matchReason: string;
  confidence: 'high' | 'medium';
}

/** The inverse direction of MatchCandidate — given a case that was just
 *  formally accessioned, a pending intraop session that might belong to
 *  it, with the full session attached (not just an ID) since the caller
 *  — AccessionPage's post-submit merge prompt — needs the session's real
 *  content to show, not just a reference to look up separately. */
export interface EntryMatch {
  entry: IntraoperativeEntry;
  matchType: 'mrn_exact' | 'fuzzy';
  matchReason: string;
  confidence: 'high' | 'medium';
}

/** Passed to merge() so the resulting audit log entry records HOW a
 *  match was resolved, not just that it was — see mockIntraoperativeService
 *  .merge()'s own comment for why this matters (a merge links PHI across
 *  two records; "we merged it" without "into what we thought, at what
 *  confidence, and whether a human overrode the suggestion" isn't a
 *  defensible trail for a CAP/CLIA audit).
 *  matchType is 'manual' when no system-suggested match was involved at
 *  all (confidence is meaningless there, so it's null) — distinct from
 *  wasManualOverride, which is true specifically when a real suggested
 *  match EXISTED but the user chose to type a different case ID instead
 *  of accepting it. Both can be true at once (typed a case ID with zero
 *  suggestions ever shown = matchType 'manual', wasManualOverride false,
 *  since there was nothing to override); typing over a real suggestion
 *  sets both matchType 'manual' AND wasManualOverride true. */
export interface MergeResolutionContext {
  matchType: 'mrn_exact' | 'fuzzy' | 'manual';
  confidence: 'high' | 'medium' | null;
  wasManualOverride: boolean;
  performedBy: string;
}

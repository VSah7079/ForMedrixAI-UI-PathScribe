// src/types/reports/AmendmentRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Amendment/Addendum record — replaces what was a fully decorative
// feature: the modal existed and looked functional, but its submit
// handler never persisted anything at all (checked directly — closed
// the modal, showed a success toast, cleared the text field, done).
//
// Addendum: new information appended; original stays entirely
// untouched. Amendment: existing finalized information was wrong and
// is being corrected — requires an explanation and, per CAP/RCPath
// accreditation requirements, proof the treating clinician was
// actually notified. That notification log is the one field this spec
// calls "the most crucial audit trail," and it's a genuine hard gate
// here, not optional.
//
// Deliberately scoped: this captures the real amendment/addendum
// record — explanation, notification log, timestamps, authorship,
// sequencing. It does NOT attempt to version or re-edit the underlying
// synoptic answers themselves (a major diagnostic change like Benign
// → Malignant showing as live, edited text in the active report view,
// with the old text preserved in a parallel version history) — that's
// a substantially larger feature touching how report editing itself
// works, not something to half-build silently inside this pass.
// ─────────────────────────────────────────────────────────────────────────────

// Three parallel revision kinds, matching CAP accreditation language and
// HL7 result-status semantics ('C' = corrected vs. a revised-narrative
// amendment) rather than a single 'amendment' bucket with an internal
// severity flag — see AMENDMENT_STATUS_REDESIGN_BRIEF.md for the full
// rationale. 'correction' is administrative/clerical only (specimen site
// label, misspelled name) with the diagnosis unchanged — it does NOT
// carry the Clinical Notification hard gate that 'amendment' does (see
// captureFields/release in mockAmendmentService.ts), but still requires
// explanationOfChange for the audit trail.
export type AmendmentType = 'addendum' | 'amendment' | 'correction';

// Mirrors AmendmentType, plus 'original' for a report that has never been
// revised. Lives on SynopticReportInstance/Case (as `lastRevisionType`) —
// the case/instance-level "what was the most recent revision" flag that
// drives the Final (Amended) / Final (Corrected) / Final (Addendum)
// display label once status is 'finalized'. Kept separate from
// AmendmentType (the AmendmentRecord's own type) rather than reused
// directly, since 'original' has no meaning on an AmendmentRecord itself.
export type RevisionType = 'original' | AmendmentType;

export type NotificationMethod = 'verbal_phone' | 'secure_page' | 'direct_lis_flag';

export interface ClinicalNotification {
  clinicianName: string;
  method: NotificationMethod;
  notifiedAt: string;
}

export interface AmendmentRecord {
  id: string;
  caseId: string;
  type: AmendmentType;
  /** Real, per direct guidance's own follow-up on structured linkage:
   *  which real SynopticReportInstance (and, via that instance's own
   *  specimenId, which real specimen) this amendment/addendum actually
   *  applies to - previously entirely absent, even though
   *  useAmendmentWorkflow.ts's own openAmendmentDraft already has this
   *  exact context (activeReportInstanceId) available at the moment a
   *  draft is created. Optional since a case-level amendment (no
   *  single report instance it's scoped to) is still real and valid -
   *  never fabricated when the real context isn't genuinely known. */
  reportInstanceId?: string;
  /** Denormalized alongside reportInstanceId, same real posture as
   *  sourceLabel elsewhere in this app - a display convenience so a
   *  real amendment list doesn't need to re-resolve the specimen from
   *  the report instance every render, not a second source of truth
   *  (reportInstanceId is authoritative; this is derived from it at
   *  the moment of creation and never re-derived afterward). */
  specimenId?: string;
  /** Real, per direct guidance's own detailed post-sign-out revision
   *  taxonomy: a structured reason code (ReasonDictionaryEntry.id,
   *  category matching this record's own `type` uppercased -
   *  'addendum'->'ADDENDUM', 'amendment'->'AMENDMENT',
   *  'correction'->'CORRECTION') paired with explanationOfChange's own
   *  required free text, not a replacement for it. Required for every
   *  real AmendmentType per that same guidance - addenda included,
   *  not just amendment/correction, which is why this lives here
   *  rather than under the amendment-specific fields below. */
  reasonId?: string;
  /** Per-case, per-type sequence — "Addendum 1", "Addendum 2", etc.
   *  Amendments don't customarily get numbered the same way in most
   *  LISs (each one supersedes for notification purposes), but the
   *  field is tracked for both so the count is always available if
   *  a site wants to display it. */
  sequenceNumber: number;

  // ── Addendum-specific ─────────────────────────────────────────────
  /** Required for addendum — e.g. "Addendum: Immunohistochemical
   *  Staining Results". Not applicable to amendments. */
  addendumTitle?: string;

  // ── Amendment-specific ────────────────────────────────────────────
  /** Required for amendment — the mandatory "why," so the treating
   *  clinician doesn't have to spot the difference themselves. */
  explanationOfChange?: string;
  /** The hard gate — sign-out cannot release an amendment without
   *  this being filled in. Not optional, not skippable. */
  notification?: ClinicalNotification;

  /** The actual new content — supplemental data for an addendum, or
   *  the corrected text/values for an amendment. */
  body: string;

  /** When the tech/pathologist opened the addendum/amendment
   *  workspace — distinct from releasedAt. */
  initiatedAt: string;
  /** When officially authorized/released — kept entirely separate
   *  from the original case sign-out timestamp. Null while still a draft. */
  releasedAt?: string;

  authoringPathologist: { userId: string; userName: string };
  status: 'draft' | 'released';
  /** Whether this record originated from an LIS-side amendment notice, rather than the pathologist independently amending. */
  triggeredByLisNotice?: boolean;

  /** The actual "immutable archive" requirement — a real snapshot of
   *  the synoptic report instance exactly as it was at the moment of
   *  unlock, before any editing happens. Captured at Stage 1
   *  (captureFields), not reconstructed later — there's no way to
   *  recover the original answers after the pathologist starts
   *  editing the unlocked instance in place, since that edits the
   *  same object with no other backup anywhere. Only meaningful for
   *  amendments; addenda never touch or overwrite anything original. */
  originalReportSnapshot?: unknown;
}

// src/services/patients/IPatientIndexService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Master Patient Index (MPI) — the missing piece found while tracing
// why "Patient History" couldn't reliably surface a patient's prior
// cases: Case.patient.id was generated as `OPAT-${caseId.slice(4)}`,
// derived from the CASE, not the PERSON. The same real-world patient with
// two different cases got two completely unrelated patient ids — there
// was no actual person-level identity anywhere in the data model, only
// whatever the MRN text field happened to match (and per the same
// investigation, MRN alone doesn't meet the Joint Commission's
// two-identifier minimum for patient-identification-critical actions).
//
// Deliberately MPI, not EMPI: scoped per organisationId, not global
// across every PathScribe customer. You would not want one lab
// organisation's patients cross-matched against a completely different,
// unrelated organisation's — that's not deduplication, that's a real
// privacy violation. A true EMPI (matching across institutions) is a
// substantially different, larger scope than what a single-lab MPI needs,
// and isn't what's being built here.
//
// Deliberately deterministic, not probabilistic: a real production-grade
// EMPI product (4medica and similar) does weighted, probabilistic
// candidate scoring across many demographic fields — a genuinely
// substantial engineering effort in its own right, not something to
// reproduce from scratch in the time available. What's built here is the
// real, correct FOUNDATION that a future probabilistic layer would sit
// on top of: an actual persistent per-organisation patient identity,
// checked on every accession, with anything not confidently resolvable
// deterministically routed to a human for review rather than silently
// auto-matched or silently duplicated. That routing-to-review behavior
// is the genuinely load-bearing safety property here, not the
// specific matching algorithm's sophistication.
// ─────────────────────────────────────────────────────────────────────────────

export interface PatientMatchCandidate {
  organisationId: string;
  mrn: string;
  /**
   * Real fix, per direct follow-up: the enterprise-wide scoping fix
   * (resolveMpiScopeEnterpriseId) correctly solved under-matching
   * across referring hospitals - but widened the pool that a bare MRN
   * string gets checked against, which increases a real, different
   * risk: two DIFFERENT real people at two DIFFERENT hospitals whose
   * own MRN schemes happen to produce the same string now share one
   * matching pool, with no way to tell them apart. When provided, this
   * scopes the match to a real, specific source system
   * (Facility.assigningAuthority - e.g. 'EPIC_MAIN', 'CERNER_WEST'), so
   * "MRN 12345 at Hospital A" is never confused with "MRN 12345 at
   * Hospital B." Optional, for real backward compatibility with
   * callers (manual entry, older integrations) that genuinely don't
   * know the source system - those fall back to the prior, less-
   * precise bare-MRN behavior, not a hard failure.
   */
  assigningAuthority?: string;
  firstName: string;
  lastName: string;
  /** ISO date */
  dateOfBirth: string;
  /** The accession number of the case triggering this resolution, if
   *  any. Not PHI (AuditLog.caseId's own doc comment: "accession
   *  number — not a direct patient identifier") — threaded through so
   *  the real audit events below can carry a genuine caseId. That
   *  matters for more than completeness: AuditLogPage.tsx's role-based
   *  filter only shows a pathologist-role user events that either have
   *  a real caseId, or whose `user` field exactly matches their own
   *  stored name/email. Without this, every MPI audit event would be
   *  silently invisible to the exact people accessioning the cases that
   *  triggered them. */
  sourceAccession?: string;
  /** Real feature, per direct confirmation, building Phase B of the
   *  "Interface Exception & Case-Binding Module": explicitly set only
   *  when a real, human operator marks this accession as a temporary/
   *  downtime placeholder at the moment of creation — never inferred.
   *  See MasterPatientRecord.isDowntimeRecord's own doc comment for
   *  the full reasoning. */
  isDowntimeRecord?: boolean;
  /** The real reason code (types/patients/BreakGlassReasonCode.ts)
   *  this accession is being marked a downtime record, when it is. */
  downtimeReasonCode?: string;
}

export type PatientMatchResult =
  | { outcome: 'matched'; patientId: string }
  | { outcome: 'created'; patientId: string }
  /** A real safety outcome, not an error — surfaced when a confident,
   *  deterministic match can't be made either way (e.g. the MRN matches
   *  an existing record but the name/DOB don't, or vice versa). The
   *  caller must NOT silently pick a side, but accessioning also can't
   *  simply halt while a person reviews it — so a real, provisional
   *  MasterPatientRecord is still created and returned as patientId,
   *  explicitly marked needsReview, alongside the existing records that
   *  partially matched (candidatePatientIds) for that reviewer's
   *  context. A real admin resolves this later — either confirming the
   *  provisional record really is a new person, or merging it into one
   *  of the candidates — via listPendingReview below. */
  | { outcome: 'ambiguous'; patientId: string; candidatePatientIds: string[]; reason: string };

export interface MasterPatientRecord {
  /** The real, persistent identity — reused across every case for the
   *  same real-world person within this organisation, never derived
   *  from a case id. */
  id: string;
  organisationId: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  createdAt: string;
  updatedAt: string;
  /** Real, per PathScribe Interface Specification v1.2 §2.6 (patient
   *  data minimization) - the real resolveOrCreatePatient() outcome
   *  that first established this identity, persisted here since a
   *  much-later consumer (a billing payload built weeks after
   *  accession, at sign-out) needs this same signal and the outcome
   *  itself is otherwise only ever returned transiently, in the
   *  moment, by resolveOrCreatePatient() - never stored anywhere
   *  before this field. Set once, at creation, never changed
   *  afterward - a patient's own later cases at this org are always
   *  real re-matches against this same, already-established identity,
   *  regardless of how THIS record first came to exist.
   *
   *  Real, per direct guidance (Outside Client Support: "completely
   *  bypassing the identity reconciliation queue"): 'created_unmatched'
   *  is genuinely distinct from 'created' - both mean this identity
   *  didn't exist before, but 'created' means resolveOrCreatePatient()
   *  actually ran its real fuzzy matching first and confidently found
   *  nothing; 'created_unmatched' means no matching was ever attempted
   *  at all (resolvePatientWithoutMatching(), Outside/Contract Case
   *  accessioning only). A real, honest, permanent record of HOW this
   *  identity came to exist, not silently indistinguishable from a
   *  genuinely-checked new patient. */
  establishedVia: 'matched' | 'created' | 'ambiguous' | 'created_unmatched';
  /**
   * Real fix, per direct follow-up on Phase 3 (idempotency & sequence
   * control, per the original spec's own "EVN-2" framing): the real,
   * source-system event timestamp of the most recent ADT event that
   * actually updated this record's demographic fields - distinct from
   * updatedAt, which only tracks when THIS system last wrote to the
   * record, not when the real-world event occurred. A real, later-
   * arriving ADT message carrying an EARLIER real event timestamp
   * (network delay, retry, re-delivery) must never overwrite state a
   * genuinely newer event already established - this is what makes
   * that check possible. Optional: a record created before this field
   * existed, or one that has never received a real demographic
   * update via ADT, genuinely has none yet.
   */
  lastEventAt?: string;
  /** True only for a provisional record created from an 'ambiguous'
   *  match outcome — real accessioning couldn't wait on a human review,
   *  so this exists so the case has a valid patient id right away, but
   *  it's flagged for a real admin to resolve (confirm as genuinely new,
   *  or merge into one of reviewCandidateIds). */
  needsReview?: boolean;
  reviewReason?: string;
  reviewCandidateIds?: string[];
  /** The accession number that first triggered this record's creation,
   *  if any — carried through to every later audit event about this
   *  record, per PatientMatchCandidate.sourceAccession's own doc
   *  comment on why. */
  sourceAccession?: string;
  /** Set once a real admin merges this record into another — kept, not
   *  deleted, so "this id used to exist and where it went" remains a
   *  real, traceable fact rather than a silently vanished record. */
  mergedInto?: string;
  mergedAt?: string;
  /** Real feature, per direct confirmation: working through the full
   *  list of ADT demographic/identity trigger events. PID-11 —
   *  structured, matching the real HL7 XAD component order
   *  (street^otherDesignation^city^state^zip^country). Optional at
   *  every level: a real inbound message frequently carries only some
   *  of these, and this app never fabricates the rest. */
  address?: { street?: string; city?: string; state?: string; zip?: string; country?: string };
  /** PID-13 (Phone Number - Home). Kept as the raw XTN string —
   *  real-world formatting varies too much (extensions, country
   *  codes) to safely decompose without a real, confirmed format. */
  phone?: string;
  /** PID-16 (HL7 Table 0002, Marital Status) — real, standard table,
   *  but genuinely user-defined/site-extensible, same "guided free
   *  text, not a closed enum" posture as locationStatus/
   *  personLocationType elsewhere in this app (services/locations/). */
  maritalStatus?: string;
  /** PID-9 (Patient Alias) — real, repeating field; every real alias
   *  on record, not just the most recent. Genuinely distinct from
   *  legal name (firstName/lastName): a "Jane Doe" placeholder
   *  converting to a legal name is a demographic UPDATE (firstName/
   *  lastName themselves change); an alias is an ADDITIONAL, real name
   *  this person is also known by, kept alongside the legal one, not
   *  replacing it. */
  aliases?: string[];
  /** PID-29 (Patient Death Indicator) — real, standard "Y"/"N" field.
   *  Modeled as a real boolean, not the raw Y/N string, since this
   *  app's own consumers (worklist filters, chart displays) need a
   *  real boolean to check, not an HL7 code to re-parse. Undefined
   *  (not `false`) for a record that has never received a real death
   *  indicator at all — never assumed alive by default, genuinely
   *  unknown until a real message says so either way. */
  deceased?: boolean;
  /** PID-30 (Patient Death Date and Time). Only genuinely meaningful
   *  alongside `deceased: true` — present without it would be
   *  contradictory, never constructed that way by this app's own
   *  write paths. */
  deathDateTime?: string;
  /** Real feature, per direct confirmation, building Phase B of the
   *  "Interface Exception & Case-Binding Module": true only when this
   *  record was explicitly, deliberately marked as a temporary/
   *  downtime placeholder identity at the moment of accessioning
   *  (e.g. a "DOE^JOHN_1234"-style local MRN created during a real
   *  outage or emergency, before the true EHR patient was known).
   *  Deliberately never inferred from a name pattern — a real patient
   *  could legitimately be named "John Doe," so this must be an
   *  explicit, human-confirmed choice, not a guess. This flag is what
   *  makes `breakGlassRebind()`'s own real restriction possible: only
   *  a genuinely-flagged downtime record can ever be rebound that
   *  way, not an arbitrary patient merge wearing the same UI. */
  isDowntimeRecord?: boolean;
  /** The real reason this was marked a downtime record, from the same
   *  real taxonomy `breakGlassRebind()` itself requires
   *  (types/patients/BreakGlassReasonCode.ts) — captured once, at
   *  creation, so the eventual rebind's own audit trail can show both
   *  "why this placeholder existed" and "why it was rebound." */
  downtimeReasonCode?: string;
}

/**
 * Real fix, per direct discussion: a confirmed Link is genuinely
 * different from a Merge. A Merge means one record was a mistake -
 * collapse it into the other, repoint every case, the old id stops
 * being a valid ongoing match target. A Link means two records are
 * each real, independently-valid identities (e.g. the same real
 * patient referred to this lab by two different, unrelated EMR
 * systems, each with its own real, ongoing MRN) that a human has
 * confirmed represent the same real person - neither is deprecated,
 * both keep matching new orders under their own MRN going forward.
 * Never automatic - always a real, human-confirmed action.
 *
 * Real, per direct guidance: relationshipType is what makes a Link
 * safe to reuse for a genuinely different real purpose - two DISTINCT
 * real people who are clinically related (e.g. a newborn and their
 * mother), not the same person under two identities. This distinction
 * is load-bearing, not cosmetic: getLinkedPatientIds() below requires
 * an explicit relationshipType filter specifically so a consumer that
 * merges linked patients' own case histories together
 * (patientHistoryQuery.ts) can never accidentally include a
 * 'family_relation' link's own, genuinely separate patient - that
 * would silently fold a mother's and her baby's own, real, distinct
 * clinical histories into one view. See PatientHistoryModal.tsx's own
 * real "Related Patients" section (distinct from its case-history
 * list) for the real, separate UI treatment 'family_relation' gets.
 */
export type PatientLinkRelationshipType = 'same_person' | 'family_relation';

export interface PatientLink {
  id: string;
  patientIdA: string;
  patientIdB: string;
  relationshipType: PatientLinkRelationshipType;
  linkedBy: string;
  linkedAt: string;
  /** The real reason this link was suggested in the first place -
   *  carried over from the ambiguous match's own reviewReason, for a
   *  real audit trail of why a human confirmed it. */
  reason?: string;
}

/**
 * Real fix, per direct follow-up on the rest of Phase 0: the multi-
 * authority identifier crosswalk. MasterPatientRecord.mrn is a single
 * string - real patients commonly have more than one real, valid
 * identifier (a different MRN at each hospital that's ever referred
 * them to this lab), and a bare string with no record of WHICH system
 * issued it is exactly what creates the collision risk described on
 * PatientMatchCandidate.assigningAuthority above. Each real identifier
 * this lab has ever seen for a patient gets its own row here, tagged
 * with its real source system - not just the one that happened to
 * create the record.
 */
export interface PatientIdentifier {
  id: string;
  patientId: string;
  assigningAuthority: string;
  identifierValue: string;
  /** How this identifier came to be recorded - a real audit trail,
   *  same reasoning as PatientLink.reason. 'resolution' is the normal,
   *  automatic path (recorded the moment resolveOrCreatePatient
   *  confidently matches or creates using this identifier);
   *  'manual' is a real admin adding one directly (e.g. after
   *  learning about a source system that hasn't sent a real order
   *  yet). */
  source: 'resolution' | 'manual';
  recordedAt: string;
}

export interface IPatientIndexService {
  /** The real accession-time entry point. Looks for an existing person
   *  in this organisation matching the candidate; reuses their id if
   *  confidently found, creates a new persistent identity if confidently
   *  not found, and returns 'ambiguous' — never a silent guess — for
   *  anything in between. */
  resolveOrCreatePatient(candidate: PatientMatchCandidate): Promise<PatientMatchResult>;

  /**
   * Real, per direct guidance (Outside Client Support & International
   * Financial Class Architecture Specification: "completely bypassing
   * the identity reconciliation queue"). A real, deliberate, second
   * entry point — NOT a parameter on resolveOrCreatePatient() above,
   * since the two represent genuinely different real intents: that
   * one actively tries to find an existing person first; this one
   * never does, by design. Always creates a fresh, real, persistent
   * identity — never matches, never returns 'ambiguous', never flags
   * for review. The real reason this exists, worked through directly
   * before building: an Outside/Contract Case's demographics come
   * from a source system this lab has no real relationship with — an
   * NIR, an NHS Number, a foreign MRN scheme — forcing them through
   * this lab's own domestic MRN/name/DOB matching logic risks a false
   * 'ambiguous' flag with real administrative review overhead and no
   * real clinical benefit. Scoped to real, explicit accessioner intent
   * (AccessionPage.tsx's own intakeType === 'outside' only) — never
   * the default path for any other real accession. Real, deliberate
   * design choice, not a functional gap: this does NOT replace the
   * genuinely valuable real "Check for Existing Patient" search
   * (PatientLinkSearch.tsx, same_person) already available on the same
   * Outside Patient Data tab — a human explicitly recognizing a real,
   * returning outside patient and confirming a real linkPatients()
   * call afterward is a completely different, complementary real
   * mechanism from this one, not a substitute for it.
   */
  resolvePatientWithoutMatching(candidate: PatientMatchCandidate): Promise<PatientMatchResult>;

  getById(patientId: string): Promise<MasterPatientRecord | null>;

  /** Every record flagged 'ambiguous' at some point, still awaiting a
   *  real person's review — the real work queue this whole safety
   *  property depends on actually being looked at, not just detected. */
  listPendingReview(organisationId: string): Promise<MasterPatientRecord[]>;

  /**
   * Real feature, per direct confirmation, building Phase B of the
   * "Interface Exception & Case-Binding Module": the real, filtered
   * list of downtime/placeholder records still awaiting a real
   * Break-Glass rebind — genuinely flagged `isDowntimeRecord: true`
   * AND not already `mergedInto` something (an already-rebound record
   * has nothing left to do). Powers the restricted rebind UI's own
   * "select which downtime identity to resolve" step.
   */
  listDowntimeRecords(organisationId: string): Promise<MasterPatientRecord[]>;

  /**
   * Real feature, per direct confirmation: a genuinely general
   * name/MRN search across this organisation's real patient index —
   * used by the restricted rebind UI to find the real, confirmed
   * target patient a downtime record should resolve to. Deliberately
   * simple (substring match on name or MRN, case-insensitive) — this
   * is a real, human-driven lookup step, not an identity-resolution
   * algorithm the way resolveOrCreatePatient() is.
   */
  searchPatients(organisationId: string, query: string): Promise<MasterPatientRecord[]>;

  /** A real admin confirms the provisional record genuinely is a
   *  different, new person from every candidate it was flagged against.
   *  Clears the review flag; the record becomes a normal, confirmed
   *  identity going forward. */
  confirmAsNewPatient(patientId: string): Promise<void>;

  /**
   * Real feature, per direct architecture confirmation, working
   * through the full Interface Exception & Case-Binding Module: a
   * real, narrow gap found while fixing A40/A24/A47/A43's own
   * "never fabricate an identity" check — resolveOrCreatePatient()'s
   * 'created' outcome (unlike 'ambiguous', which already sets
   * needsReview via createProvisional) produces an ordinary, entirely
   * UNFLAGGED record. When a caller determines after the fact that a
   * just-created record shouldn't be trusted as a real, confirmed
   * identity for the event that triggered its creation (e.g. an A40
   * whose MRG-1 didn't match anything, so resolveOrCreatePatient()
   * fabricated a new record as a byproduct of checking), this marks
   * it needsReview so a human sees it, rather than deleting it —
   * matching this app's own "kept, not deleted; a real, traceable
   * fact" posture already applied to merged records elsewhere.
   */
  flagForReview(patientId: string, reason: string): Promise<void>;

  /** A real admin confirms the provisional record is actually the SAME
   *  person as an existing one. Repoints every case currently pointing
   *  at the provisional id over to the confirmed id, then marks the
   *  provisional record as merged (kept, not deleted — a real audit
   *  trail of "this id used to exist and where it went" matters here,
   *  the same reasoning already applied to audit logs elsewhere in this
   *  app) rather than erasing it outright.
   *
   *  Real, found-and-fixed gap: also repoints every real Encounter
   *  record under the provisional id (services/encounters/) —
   *  previously left silently orphaned, still pointing at the
   *  deprecated id, even though every one of its own cases correctly
   *  moved. A merge means "same real person," so there's no real
   *  sharing ambiguity the way moveCaseToPatient() below has to
   *  account for — every encounter genuinely belongs to the one real,
   *  now-canonical person.
   *
   *  Real, per direct guidance ("we trigger the json packages and the
   *  interface engine generates the formatted messages" / Pathology
   *  HL7 Outbound Feature Spec §4, ADT^A40): also enqueues a real
   *  outbound ADT^A40 payload reference
   *  (services/patients/IOutboundPatientAdtQueueService.ts) — unless
   *  suppressAdtEnqueue is true. That flag exists specifically for
   *  breakGlassRebind() below, which calls this method internally but
   *  represents a genuinely different real HL7 event (A47, not A40) —
   *  without it, a rebind would incorrectly also enqueue a merge
   *  event alongside its own, correct identifier-change one. */
  mergeIntoExistingPatient(provisionalPatientId: string, confirmedPatientId: string, suppressAdtEnqueue?: boolean): Promise<{ casesRepointed: number; caseIds: string[]; encountersRepointed: number }>;

  /**
   * Real feature, per direct architecture confirmation: ADT^A43 (Move
   * Patient Information) — genuinely different from
   * mergeIntoExistingPatient. A43 moves ONE specific, misattributed
   * Case from the patient it was wrongly attached to over to the
   * correct patient — unlike a merge, NEITHER identity is retired;
   * both remain real, separate, independently-active people (the
   * source patient's other real cases, if any, are untouched and stay
   * exactly where they are). Validates the case genuinely belongs to
   * sourcePatientId before moving — never blindly repoints a case that
   * doesn't actually match the claimed source (this also naturally
   * guards against double-moving an already-moved case, since its
   * patient.id would no longer match). `eventTimestamp` (the real,
   * source-system EVN-2) is recorded in the audit trail below, not
   * used as a stale-event rejection check the way updateStatus/
   * updateLocation are — a Case has no equivalent lastEventAt baseline
   * to compare against. Logs a real, dedicated audit event carrying
   * the source patient id, target patient id, and the specific case
   * id — real, standard CAP/CLIA traceability requirement for moving a
   * diagnostic report across patient charts.
   *
   * Real, found-and-fixed gap: also handles the moved case's own
   * linked Encounter (services/encounters/), not just the case itself
   * — previously left silently pointing at the source patient even
   * after the case moved. Genuinely careful about a real Encounter
   * being shareable by more than one Case (multiple specimens from the
   * same real clinical visit): `encounterOutcome` reports which of the
   * three real outcomes happened — `'reassigned'` (the encounter
   * belonged exclusively to this case, so it moved too), `
   * 'unlinked_shared'` (another real case under the source patient
   * still needs this same encounter, so it correctly stays there, and
   * the just-moved case's own encounterId is cleared rather than left
   * stale and cross-patient), or `'none'` (the case had no linked
   * encounter to begin with).
   */
  moveCaseToPatient(
    caseId: string,
    sourcePatientId: string,
    targetPatientId: string,
    eventTimestamp: string
  ): Promise<{ moved: boolean; reason?: string; encounterOutcome?: 'reassigned' | 'unlinked_shared' | 'none' }>;

  /**
   * Real feature, per direct confirmation, building Phase B of the
   * "Interface Exception & Case-Binding Module": Break-Glass
   * Reassignment. Genuinely different from moveCaseToPatient() — a
   * downtime/placeholder identity (MasterPatientRecord.isDowntimeRecord)
   * is NOT a real, separate person the way A43's source/target are;
   * it's the SAME real person, temporarily unidentified. So this
   * operates at the PATIENT level (like mergeIntoExistingPatient(),
   * which it wraps internally) — every real Case under the downtime
   * identity moves, and the downtime record itself is retired
   * (`mergedInto`), not kept independently active.
   *
   * Real, load-bearing restriction: only ever succeeds when
   * `downtimePatientId` is a record genuinely flagged
   * `isDowntimeRecord: true` — refuses to run on an arbitrary patient,
   * which is what makes this "restricted" rather than a second,
   * parallel way to perform an ordinary merge.
   *
   * Real, standard reason-code taxonomy required
   * (types/patients/BreakGlassReasonCode.ts) — `reasonCode` alone,
   * without `notes`, is rejected; a bare code is not a real
   * justification. Logs a real, dedicated, immutable audit payload:
   * original MRN, new MRN, every real Case id repointed, user id,
   * timestamp, reason code, and notes — captured in one audit entry,
   * not reconstructed after the fact from separate ones.
   */
  breakGlassRebind(input: {
    downtimePatientId: string;
    confirmedPatientId: string;
    reasonCode: string;
    notes: string;
    performedBy: string;
  }): Promise<{ rebound: boolean; reason?: string; casesRepointed?: number; caseIds?: string[] }>;

  /**
   * Real fix, per direct discussion: the third real resolution for an
   * ambiguous match, distinct from merge. Confirms two records are the
   * same real person WITHOUT collapsing either one — both stay fully,
   * independently active and keep matching their own future orders
   * under their own real MRN. Clears the review flag on the provisional
   * record, same as the other two resolutions, but never repoints
   * cases and never sets mergedInto on either side.
   *
   * Real, per direct guidance: relationshipType is required, not
   * defaulted — every real caller must be explicit about which of the
   * two genuinely different real relationships this link represents.
   * See PatientLink's own doc comment for why this distinction is
   * load-bearing, not cosmetic.
   */
  linkPatients(patientIdA: string, patientIdB: string, relationshipType: PatientLinkRelationshipType, linkedBy: string, reason?: string): Promise<PatientLink>;

  /** Real fix: every patientId transitively linked to the given one
   *  (including itself), for real "Patient History" queries that need
   *  to pull cases from every linked identity, not just one. Follows
   *  chains (A linked to B, B linked to C) rather than only one hop.
   *
   *  Real, per direct guidance: relationshipType is a required filter,
   *  not optional — the graph traversal itself only follows edges of
   *  the requested type, so a chain mixing both real relationship
   *  types (e.g. A-B same_person, B-C family_relation) never lets an
   *  unrelated relationship type leak into the result through a
   *  shared intermediate patient. patientHistoryQuery.ts always
   *  requests 'same_person' — the only type that should ever merge
   *  case histories together; a caller building a "Related Patients"
   *  cross-reference (PatientHistoryModal.tsx) requests
   *  'family_relation' separately. */
  getLinkedPatientIds(patientId: string, relationshipType: PatientLinkRelationshipType): Promise<string[]>;

  /** Every confirmed link involving this organisation's patients - the
   *  real audit trail of who linked what, when, and why. */
  listLinks(organisationId: string): Promise<PatientLink[]>;

  /**
   * Real fix: the precise, assigning-authority-aware lookup that
   * resolveOrCreatePatient now checks FIRST, before falling back to
   * the less-precise bare-MRN match. Returns the real, canonical
   * patientId if this exact (assigningAuthority, identifierValue) pair
   * has been seen before - never a guess across two different source
   * systems that happen to share an identifier string.
   */
  resolveByIdentifier(assigningAuthority: string, identifierValue: string): Promise<string | null>;

  /** Every real identifier recorded for a patient, across every source
   *  system this lab has ever seen them referred from. */
  listIdentifiersForPatient(patientId: string): Promise<PatientIdentifier[]>;

  /** A real admin records a known identifier directly - e.g. after
   *  learning a hospital's assigning authority code ahead of that
   *  hospital ever actually sending a real order. Internal callers
   *  (resolveOrCreatePatient) pass source='resolution' explicitly;
   *  defaults to 'manual' for real, direct admin use. */
  addIdentifier(patientId: string, assigningAuthority: string, identifierValue: string, source?: 'resolution' | 'manual'): Promise<PatientIdentifier>;

  /**
   * Real fix, Phase 3: the actual, missing "update" half of ADT^A08
   * (Update Patient Information) - before this, a 'matched' outcome
   * from resolveOrCreatePatient confirmed identity but never wrote any
   * new demographic data back to the record, so a real A08 had no
   * real effect at all. Enforces real sequence control: eventTimestamp
   * (the real, source-system EVN-2 value) is only applied if it's
   * genuinely newer than the record's current lastEventAt - an
   * out-of-order, stale event (network delay, retry, re-delivery)
   * is honestly rejected, never silently applied over newer state.
   * Returns the real, current record either way (updated or
   * unchanged), plus whether this specific update was actually
   * applied, so a caller can tell "changed" from "correctly ignored"
   * apart rather than assuming success.
   */
  updateDemographics(
    patientId: string,
    demographics: {
      firstName?: string; lastName?: string; dateOfBirth?: string;
      /** Real feature, per direct confirmation: working through the
       *  full list of ADT demographic/identity trigger events. Same
       *  "only the fields genuinely present are changed, undefined
       *  fields are left as-is" posture as every other narrow update
       *  method in this app (e.g. Encounter.updateMetadata) — an A08
       *  updating only the address shouldn't blank out an existing
       *  phone number. `aliases`, when present, REPLACES the existing
       *  array wholesale rather than appending — PID-9 is a real,
       *  repeating field that carries the complete, current set as of
       *  that message, not an incremental delta; the sending system is
       *  the source of truth for "what aliases does this person have
       *  right now." */
      address?: { street?: string; city?: string; state?: string; zip?: string; country?: string };
      phone?: string;
      maritalStatus?: string;
      aliases?: string[];
      deceased?: boolean;
      deathDateTime?: string;
    },
    eventTimestamp: string
  ): Promise<{ record: MasterPatientRecord; applied: boolean }>;
}

// src/services/encounters/IEncounterService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real Encounter entity - the second genuinely missing piece of Phase 0,
// confirmed multiple times during scoping: zero references to an
// encounter concept existed anywhere in this codebase. The closest
// thing was IncomingOrder.encounterNumber (services/orderIntake/) - a
// bare, unstructured string captured at order intake that went
// nowhere structured. This is the real entity that field should have
// been resolving into.
//
// A real Encounter is the transient visit/interaction context a case
// happens within - genuinely different from Patient identity itself.
// The same real patient can have many encounters over time (this
// admission, that outpatient visit); a given case's specimens were
// collected during exactly one of them. Per the original spec's own
// framing: "Ephemeral visit context," distinct from the Patient's own
// persistent identity.
//
// Same real, established pattern as services/patients/: standard
// interface/mock pattern, scoped by organisationId for the same
// reason patient identity is - an encounter at one lab organisation
// is never a valid match for a different, unrelated organisation's
// encounter, regardless of how well anything else lines up.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type EncounterClass = 'Inpatient' | 'Outpatient' | 'Emergency' | 'Ambulatory' | 'Virtual';

export type EncounterStatus = 'Planned' | 'Arrived' | 'In-Progress' | 'Discharged' | 'Cancelled';

/** Real fix, per direct, detailed correction: DG1 is its own,
 *  dedicated HL7 segment — not part of OBR, and not exclusively an
 *  "order-level" concept the way an earlier pass of this codebase's
 *  own documentation briefly, incorrectly implied. DG1 legitimately
 *  rides with ADT (A01/A04/A08 — an admission/registration/update
 *  diagnosis), among other real message types. This app's own,
 *  already-existing outbound DG1 builder (services/hl7/
 *  segmentBuilders.ts's buildDG1) already, correctly, structures
 *  DG1-3 as code^description^codingSystem — mirrored here exactly for
 *  the inbound/parsing direction, rather than inventing a different
 *  shape for the same real field. */
export interface EncounterDiagnosis {
  /** DG1-3.1 — the real ICD code itself (e.g. "E11.9"). */
  code: string;
  /** DG1-3.2 — the real, human-readable description of the code. */
  description?: string;
  /** DG1-3.3 — real coding system designation (e.g. "I10" for
   *  ICD-10-CM). Kept as a raw string, same "guided free text, not a
   *  closed enum" posture as this file's own locationStatus/
   *  personLocationType fields — a real inbound message could
   *  legitimately carry a coding system this app hasn't seen before,
   *  and that shouldn't fail the whole diagnosis. */
  codingSystem?: string;
  /** DG1-6 (HL7 Table 0052) — real, standard diagnosis type
   *  distinction: 'A' (Admitting), 'W' (Working), 'F' (Final). Kept
   *  as the raw HL7 code rather than expanded to a friendlier label
   *  here — display formatting is a real UI concern, not this data
   *  layer's. */
  diagnosisType?: string;
}

export interface Encounter {
  id: string;
  organisationId: string;
  /** The real, persistent MPI identity this encounter belongs to - see
   *  services/patients/IPatientIndexService.ts's own MasterPatientRecord.
   *  Every real encounter belongs to exactly one real patient identity. */
  patientId: string;
  /** Visit or account identifier (HL7's FIN - Financial/Facility
   *  Identification Number) - the real, external identifier for this
   *  specific visit, distinct from the patient's own MRN. */
  encounterNumber: string;
  encounterClass: EncounterClass;
  status: EncounterStatus;
  admitTime?: string;
  dischargeTime?: string;
  /** Real feature, per direct confirmation: working through the full
   *  list of ADT trigger events. PV1-36 (HL7 Table 0112) — real for
   *  A03. Same "guided free text" posture as locationStatus above;
   *  Table 0112 is genuinely site-extensible in the real standard. */
  dischargeDisposition?: string;
  facility?: string;
  department?: string;
  ward?: string;
  room?: string;
  bed?: string;
  /** Real feature, per direct confirmation: "we will need to accept
   *  PV1 HL7 data, but I don't believe we have Location / Rooms
   *  defined in config. They would naturally be associated to the
   *  Facility." The real, resolved Location (services/locations/)
   *  this encounter's PV1-3 crosswalked to — kept alongside the raw
   *  facility/ward/room/bed strings above (which stay as-is, the
   *  honest record of what the inbound message actually said) rather
   *  than replacing them. Undefined for an encounter with no PV1-3,
   *  or resolved before Location existed. */
  locationId?: string;
  /** Real feature, per direct confirmation: working through the full
   *  list of ADT trigger events. Captured automatically by
   *  updateLocation() every time a real transfer (A02/A09/A10)
   *  changes locationId — the location this encounter was AT
   *  immediately before the most recent move. Exists specifically so
   *  a real A12 (Cancel Transfer) can restore it reliably, rather
   *  than trusting the cancel message's own PV1-3/PV1-6 to carry the
   *  correct value (real-world A12 messages don't always populate it
   *  completely). Undefined for an encounter that has never been
   *  transferred. */
  previousLocationId?: string;
  attendingProvider?: string;
  /** Real, new field, per PS-81 (Jira) — the real, resolved Physician
   *  (services/physicians/) this encounter's own free-text
   *  attendingProvider string was matched or auto-created against, via
   *  the real, shared resolveProviderName (services/physicians/
   *  resolveProviderName.ts). Undefined when attendingProvider itself
   *  is absent (no real name to resolve), or for an encounter created
   *  before this field existed. attendingProvider (the free-text
   *  string) is kept unchanged alongside this — real, deliberate
   *  redundancy, not replaced by it, since the string is the permanent
   *  record of what the inbound message actually said, independent of
   *  whichever Physician record it happened to resolve against. */
  attendingProviderPhysicianId?: string;
  /** Real feature, per direct confirmation: working through the full
   *  list of ADT trigger events — A08's real, previously-missing
   *  metadata fields. PV1-10 (HL7 Table 0069). */
  hospitalService?: string;
  /** PV1-14 (HL7 Table 0023). */
  admitSource?: string;
  /** PV1-20 (HL7 Table 0064). */
  financialClass?: string;
  /** Real feature, per direct, detailed correction: a real DG1
   *  segment can legitimately ride along with an inbound A01/A04/A08
   *  — every diagnosis captured on that message, in the order it
   *  arrived (real DG1-1 set-id order, not re-sorted). Genuinely
   *  distinct from IncomingOrder.icd10Codes/Case's own coding.icd10 —
   *  those represent why a specific order/specimen was requested; this
   *  represents the visit-level diagnosis captured at admission or
   *  update time, a real, different HL7 concept even when the two
   *  happen to overlap in practice. Undefined for an encounter whose
   *  creating/updating message carried no real DG1 at all — most real
   *  ADT traffic won't. */
  diagnoses?: EncounterDiagnosis[];
  /** The accession number of a case created during this encounter, if
   *  any - same real, non-PHI reasoning as MasterPatientRecord's own
   *  sourceAccession field. */
  sourceAccession?: string;
  createdAt: string;
  updatedAt: string;
  /** Real fix, Phase 4: the real, source-system event timestamp
   *  (EVN-2) of the most recent ADT event that actually updated this
   *  encounter's status - same real reasoning as
   *  MasterPatientRecord.lastEventAt (services/patients/): distinct
   *  from updatedAt, which only tracks when THIS system last wrote.
   *  A real, later-arriving ADT event carrying an earlier real
   *  timestamp must never revert a genuinely newer status (e.g. a
   *  stale, delayed "in progress" update arriving after a real,
   *  newer discharge). Optional: an encounter never updated via a
   *  real ADT status event genuinely has none yet. */
  lastEventAt?: string;
}

/** Real, shared structured shape for PV1-7 input, per PS-81 (Jira) —
 *  matches adtParser.ts's own real, structured ParsedAdtMessage
 *  ['encounter']['attendingProvider'] shape exactly (never a
 *  flattened string here anymore — see that file's own header for
 *  why). Used by both resolveOrCreateEncounter and updateMetadata
 *  below, the two real places PV1-7 data enters this service. */
export type AttendingProviderInput = { id?: string; lastName?: string; firstName?: string };

export interface IEncounterService {
  getById(encounterId: string): Promise<ServiceResult<Encounter | null>>;

  /** Every real encounter recorded for a given patient, across their
   *  full history at this organisation - most-recent-first, matching
   *  how a real clinician reviewing a patient's visit history would
   *  want it ordered. */
  listForPatient(patientId: string): Promise<ServiceResult<Encounter[]>>;

  /** Real, direct lookup by the encounter's own external identifier
   *  (FIN/visit number) - the natural key an inbound ADT or order
   *  message actually carries, before any internal Encounter.id
   *  exists yet. */
  getByEncounterNumber(organisationId: string, encounterNumber: string): Promise<ServiceResult<Encounter | null>>;

  /** Real fix: creates a new encounter, or returns the existing real
   *  one if this exact (organisationId, encounterNumber) pair has
   *  already been recorded - never creates a silent duplicate for a
   *  repeat reference to the same real visit (e.g. two different
   *  specimens from the same admission, or a later order correcting
   *  an earlier one).
   *
   *  Real bug found and fixed, per direct confirmation while working
   *  through the full list of ADT trigger events: a newly-created
   *  encounter never got a real `lastEventAt` baseline, so its very
   *  first follow-up update (updateStatus/updateLocation/updateClass/
   *  updateMetadata) — even a genuinely stale/out-of-order one — was
   *  silently ALWAYS accepted, since the sequence-control check on
   *  every one of those methods only fires when `current.lastEventAt`
   *  is already set. `eventTimestamp` (the real, source-system EVN-2
   *  of the creating A01/A04/A05) establishes that baseline. Optional:
   *  `AccessionPage.tsx`'s manual accessioning call has no real ADT
   *  event timestamp to provide, and genuinely doesn't need one — the
   *  out-of-order-network-message risk this guards against is
   *  specific to real inbound ADT ingestion. */
  resolveOrCreateEncounter(input: {
    organisationId: string;
    patientId: string;
    encounterNumber: string;
    encounterClass: EncounterClass;
    status?: EncounterStatus;
    admitTime?: string;
    facility?: string;
    department?: string;
    ward?: string;
    room?: string;
    bed?: string;
    locationId?: string;
    attendingProvider?: AttendingProviderInput;
    /** Real feature, per direct, detailed correction: a real DG1
     *  segment riding with the creating A01/A04/A05 — see
     *  Encounter.diagnoses's own doc comment. Genuinely absent for
     *  most real messages, which won't carry one. */
    diagnoses?: EncounterDiagnosis[];
    sourceAccession?: string;
    eventTimestamp?: string;
  }): Promise<ServiceResult<Encounter>>;

  /** Real status transition - e.g. a real ADT^A03 (discharge) event
   *  updating a previously 'In-Progress' encounter. Deliberately
   *  narrow (status + optional dischargeTime/dischargeDisposition
   *  only) rather than a general update, since an encounter's other
   *  fields (class, identifiers) shouldn't silently change after the
   *  fact.
   *
   *  Real fix, Phase 4: eventTimestamp enforces the same real
   *  sequence-control discipline as
   *  IPatientIndexService.updateDemographics - a genuinely stale,
   *  out-of-order event (older than the encounter's current
   *  lastEventAt) is honestly rejected, never silently applied over
   *  newer state. `applied` in the real result tells a caller
   *  "changed" from "correctly ignored" apart. */
  updateStatus(
    encounterId: string,
    status: EncounterStatus,
    eventTimestamp: string,
    dischargeTime?: string,
    dischargeDisposition?: string
  ): Promise<ServiceResult<{ encounter: Encounter; applied: boolean }>>;

  /**
   * Real feature, per direct confirmation: working through the full
   * list of ADT trigger events — A02 (Transfer), A09/A10 (Patient
   * Tracking). Real, standard sequence-control discipline, same as
   * updateStatus: a genuinely stale, out-of-order event is honestly
   * rejected, never silently applied over newer state. Automatically
   * captures the encounter's current locationId as previousLocationId
   * before applying the new one — see Encounter.previousLocationId's
   * own doc comment for why (A12's real restore path).
   */
  updateLocation(
    encounterId: string,
    locationId: string,
    eventTimestamp: string
  ): Promise<ServiceResult<{ encounter: Encounter; applied: boolean }>>;

  /**
   * Real feature, per direct confirmation — A06 (Outpatient →
   * Inpatient), A07 (Inpatient → Outpatient). Same real
   * sequence-control discipline as updateStatus/updateLocation.
   * Deliberately narrow (class only) — an encounter's identifiers
   * shouldn't change via this path.
   */
  updateClass(
    encounterId: string,
    encounterClass: EncounterClass,
    eventTimestamp: string
  ): Promise<ServiceResult<{ encounter: Encounter; applied: boolean }>>;

  /**
   * Real feature, per direct confirmation — A08 (Update Patient/Visit
   * Information)'s real, non-movement metadata fields: attending
   * physician (PV1-7), hospital service (PV1-10), admit source
   * (PV1-14), financial class (PV1-20). Previously parsed but never
   * actually applied to the Encounter — this is the real, previously-
   * missing effect of an A08 beyond MPI demographics. Same
   * sequence-control discipline; only the fields genuinely present in
   * the update are changed, undefined fields are left as-is (an A08
   * carrying only a new attending shouldn't blank out an existing
   * hospital service).
   */
  updateMetadata(
    encounterId: string,
    changes: { attendingProvider?: AttendingProviderInput; hospitalService?: string; admitSource?: string; financialClass?: string },
    eventTimestamp: string
  ): Promise<ServiceResult<{ encounter: Encounter; applied: boolean }>>;

  /**
   * Real feature, per direct, detailed correction: a real DG1 segment
   * can legitimately ride with an A08 too, not only the creating A01/
   * A04/A05 — an updated/corrected diagnosis on an already-open visit.
   * Deliberately separate from updateMetadata above rather than
   * folded into it: diagnoses are a real, different HL7 segment (DG1,
   * not PV1) and a different shape (an array, not scalar fields) —
   * kept as its own narrow method for the same "one real concept per
   * method" reasoning already applied throughout this interface.
   * Same sequence-control discipline as every other update method
   * here: a genuinely stale/out-of-order event is honestly rejected,
   * never silently applied over newer state. Replaces the full
   * diagnoses list (real DG1 sets are sent complete, not as an
   * incremental diff, in real practice) rather than merging.
   */
  updateDiagnoses(
    encounterId: string,
    diagnoses: EncounterDiagnosis[],
    eventTimestamp: string
  ): Promise<ServiceResult<{ encounter: Encounter; applied: boolean }>>;

  /**
   * Real feature, per direct confirmation — A12 (Cancel Transfer):
   * restores Encounter.locationId from the real, captured
   * previousLocationId (see that field's own doc comment for why this
   * is more reliable than trusting the cancel message's own PV1-3/
   * PV1-6). Genuinely a no-op — `applied: false`, not an error — when
   * the encounter has no previousLocationId to restore (never
   * transferred, or already restored once).
   */
  cancelTransfer(
    encounterId: string,
    eventTimestamp: string
  ): Promise<ServiceResult<{ encounter: Encounter; applied: boolean }>>;

  /**
   * Real, per direct guidance: the real fix for a genuine, found gap —
   * mergeIntoExistingPatient() and moveCaseToPatient()
   * (services/patients/) both used to repoint Case.patient.id only,
   * silently leaving any real Encounter records still pointing at the
   * old, deprecated/incorrect patient id. This is that real, dedicated
   * reassignment, deliberately its own narrow method (same "one real
   * concept per method" reasoning as every other update method here) —
   * not folded into updateMetadata, since patient identity isn't
   * encounter metadata. No sequence-control staleness rejection the
   * way updateStatus/updateLocation/updateClass have — this isn't a
   * sequence of real-time events for one encounter's own evolving
   * clinical state, it's a discrete, administrative identity
   * correction, same real shape as moveCaseToPatient() itself (which
   * also takes eventTimestamp only for the audit trail, not a
   * staleness gate). Real, load-bearing safety check: never blindly
   * repoints an encounter that doesn't actually belong to the claimed
   * source patient.
   */
  reassignPatient(
    encounterId: string,
    sourcePatientId: string,
    targetPatientId: string,
    eventTimestamp: string
  ): Promise<ServiceResult<{ encounter: Encounter; reassigned: boolean; reason?: string }>>;
}

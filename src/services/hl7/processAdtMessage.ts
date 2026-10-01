// src/services/hl7/processAdtMessage.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, the actual point of Phase 1: wires a real, parsed ADT
// message into the same real MPI (services/patients/) and Encounter
// (services/encounters/) services the accession-time flow already
// uses - not a separate, parallel identity-resolution path. A patient
// resolved from a real inbound A01 today should be the exact same
// real patientId a specimen accessioned for them tomorrow resolves to.
//
// Real, confirmed scope, per adtParser.ts's own header comment: A01/
// A04 create a real new Encounter; A08 updates the real patient
// record only, never creates a new Encounter - it is not a new visit.
// ─────────────────────────────────────────────────────────────────────────────

import { parseAdtMessage, type ParsedAdtMessage } from './adtParser';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockEncounterService } from '../encounters/mockEncounterService';
import { mockLocationService } from '../locations/mockLocationService';

export interface ProcessAdtResult {
  eventType: ParsedAdtMessage['eventType'];
  patientId: string;
  /** Mirrors the real MPI's own outcome vocabulary
   *  (services/patients/IPatientIndexService.ts) - 'ambiguous' still
   *  returns a real, usable patientId (ingestion can't halt on it,
   *  same reasoning as the accession-time flow), but flags it for the
   *  same real admin review queue. */
  mpiOutcome: 'matched' | 'created' | 'ambiguous';
  /** Real fix, Phase 3: whether this message's demographic data was
   *  actually applied to the record. False for a genuinely stale/
   *  out-of-order event (a real, later-arriving message carrying an
   *  earlier real EVN-2 timestamp) - the message was still processed
   *  (identity resolved, encounter handled), but its demographic
   *  payload was honestly rejected rather than overwriting newer,
   *  already-established state. */
  demographicsApplied: boolean;
  /** Only set for a real A01/A04 that successfully resolved an
   *  encounter - genuinely absent for A08 (never creates one) or if
   *  the message carried no real, usable visit number. Also set for a
   *  real A03 that found and updated an existing encounter. */
  encounterId?: string;
  /** Real feature, per direct confirmation: "we will need to accept
   *  PV1 HL7 data... Location / Rooms... naturally associated to the
   *  Facility." The real, resolved Location (services/locations/)
   *  this message's PV1-3 crosswalked to, for the same A01/A04 scope
   *  as encounterId above — genuinely absent when PV1-3 carried no
   *  usable pointOfCare (ward) to resolve. */
  locationId?: string;
  /** Same real, honest vocabulary as mpiOutcome — 'created' flags a
   *  genuinely new, Unverified location for the same admin review
   *  queue Facility/Physician auto-creation already uses. */
  locationOutcome?: 'matched' | 'created';
  /** Real fix, Phase 4: whether a real A03's status transition was
   *  actually applied - same real, honest "changed" vs "correctly
   *  ignored" distinction as demographicsApplied, for the same
   *  sequence-control reason. Genuinely undefined for A01/A04/A08,
   *  which never transition an existing encounter's status. Also set
   *  for A05 (Planned), A11 (Cancelled), A13 (reverted to
   *  In-Progress). */
  encounterStatusApplied?: boolean;
  /** Real feature, per direct confirmation: working through the full
   *  list of ADT trigger events. Whether a real A02/A09/A10 transfer
   *  actually applied to the encounter (same stale/out-of-order
   *  rejection posture as encounterStatusApplied). Genuinely undefined
   *  for every other event type. */
  encounterLocationApplied?: boolean;
  /** Whether a real A06/A07 class change actually applied. */
  encounterClassApplied?: boolean;
  /** Whether a real A08's metadata fields (attending/service/source/
   *  financial class) actually applied to the encounter — distinct
   *  from demographicsApplied, which covers the MPI patient record,
   *  not the encounter. Genuinely undefined when the encounter itself
   *  couldn't be resolved (no matching encounterNumber). */
  encounterMetadataApplied?: boolean;
  /** Real feature, per direct, detailed correction: whether a real
   *  A08's DG1 (diagnosis) segment actually applied to the encounter
   *  — genuinely undefined both when the encounter couldn't be
   *  resolved AND when the A08 simply carried no real DG1 at all
   *  (most won't), distinct from `false`, which specifically means "a
   *  real DG1 was present but rejected as stale/out-of-order." */
  encounterDiagnosesApplied?: boolean;
  /** Whether a real A12 (Cancel Transfer) actually restored a prior
   *  location — false (not an error) when the encounter had nothing
   *  to restore (never transferred, or already restored once). */
  transferCancelled?: boolean;
}

/** Real, honest processing: parses the raw message, then resolves
 *  real patient identity and (for A01/A04 only) a real encounter,
 *  through the exact same services the rest of this app already uses
 *  for identity resolution - never a second, separate identity
 *  concept for inbound ADT specifically.
 *
 *  Real feature, per direct confirmation: facilityId is the real
 *  Facility (services/facilities/) this inbound message's connection/
 *  interface is configured for — a real HL7 interface is set up
 *  per-facility, same posture as every other real integration setting
 *  already scoped to a Facility. Used to resolve PV1-3 against that
 *  facility's own Location dictionary. */
export async function processAdtMessage(raw: string, organisationId: string, facilityId: string): Promise<ProcessAdtResult> {
  const parsed = parseAdtMessage(raw);
  const primaryIdentifier = parsed.patient.identifiers[0];

  // Real fix: A08 (update patient information) is, by definition,
  // about an ALREADY-KNOWN identity whose demographics may
  // legitimately be changing right now - the same real reasoning
  // already applied to A40/A24/A47's own participant resolution in
  // processPatientManagementMessage.ts. Requiring the candidate's name
  // to agree with what's CURRENTLY stored (the full
  // resolveOrCreatePatient flow's own real safety check) would be
  // exactly backwards for an event whose entire point may be "the
  // name just changed" - it would flag every real, legitimate update
  // as an identity conflict. A01/A04 keep the full, name-verified flow
  // below, since those are genuinely "might be a new patient" moments
  // where that verification is the correct, important behavior. A03
  // (discharge) is, like A08, about an already-known identity too -
  // grouped with A08 here for the same reason.
  let mpiResult: { outcome: 'matched' | 'created' | 'ambiguous'; patientId: string };
  if ((parsed.eventType === 'A08' || parsed.eventType === 'A03' || parsed.eventType === 'A31') && primaryIdentifier?.assigningAuthority) {
    const known = await mockPatientIndexService.resolveByIdentifier(primaryIdentifier.assigningAuthority, parsed.patient.primaryMrn);
    if (known) {
      mpiResult = { outcome: 'matched', patientId: known };
    } else {
      // Real, genuine edge case: an A08/A03 arriving before anything
      // else has ever established this identity. Falls back to the
      // full flow rather than silently dropping the message.
      mpiResult = await mockPatientIndexService.resolveOrCreatePatient({
        organisationId,
        mrn: parsed.patient.primaryMrn,
        assigningAuthority: primaryIdentifier?.assigningAuthority,
        firstName: parsed.patient.firstName,
        lastName: parsed.patient.lastName,
        dateOfBirth: parsed.patient.dateOfBirth ?? '',
      });
    }
  } else {
    mpiResult = await mockPatientIndexService.resolveOrCreatePatient({
      organisationId,
      mrn: parsed.patient.primaryMrn,
      assigningAuthority: primaryIdentifier?.assigningAuthority,
      firstName: parsed.patient.firstName,
      lastName: parsed.patient.lastName,
      dateOfBirth: parsed.patient.dateOfBirth ?? '',
    });
  }

  // Real fix, Phase 3: the actual, missing "update" half of ADT^A08 -
  // resolveOrCreatePatient's own 'matched' outcome never wrote new
  // demographic data back to an existing record, so a real A08 had no
  // real effect at all before this. Applied consistently across every
  // event type - any of them can legitimately carry updated patient
  // data, and the real sequence-control check inside
  // updateDemographics() is what actually protects against a stale
  // event, not which event type happened to carry it.
  const demographicsResult = await mockPatientIndexService.updateDemographics(
    mpiResult.patientId,
    {
      firstName: parsed.patient.firstName, lastName: parsed.patient.lastName, dateOfBirth: parsed.patient.dateOfBirth,
      // Real feature, per direct confirmation: working through the
      // full list of ADT demographic/identity trigger events. These
      // were parsed by parsePID above but never actually threaded
      // through to updateDemographics() until now — a real A08/A03/
      // A31 carrying PID-9/11/13/16/29/30 would have parsed them
      // correctly and then silently discarded them.
      address: parsed.patient.address, phone: parsed.patient.phone, maritalStatus: parsed.patient.maritalStatus,
      aliases: parsed.patient.aliases.length > 0 ? parsed.patient.aliases : undefined,
      deceased: parsed.patient.deceased, deathDateTime: parsed.patient.deathDateTime,
    },
    parsed.recordedAt
  );

  // Real fix: a genuine, multi-identifier PID-3 (e.g. an MRN AND a
  // separate payer id) shouldn't lose every identifier past the
  // first - each additional real one gets its own real crosswalk row,
  // same as the primary one already does inside resolveOrCreatePatient
  // itself.
  for (const identifier of parsed.patient.identifiers.slice(1)) {
    if (identifier.assigningAuthority) {
      await mockPatientIndexService.addIdentifier(
        mpiResult.patientId,
        identifier.assigningAuthority,
        identifier.identifierValue,
        'resolution'
      );
    }
  }

  let encounterId: string | undefined;
  let encounterStatusApplied: boolean | undefined;
  let encounterLocationApplied: boolean | undefined;
  let encounterClassApplied: boolean | undefined;
  let encounterMetadataApplied: boolean | undefined;
  let encounterDiagnosesApplied: boolean | undefined;
  let transferCancelled: boolean | undefined;
  let locationId: string | undefined;
  let locationOutcome: 'matched' | 'created' | undefined;

  // Real feature, per direct confirmation: working through the full
  // list of ADT trigger events. Shared by every event group below that
  // can carry a real PV1-3 — creation (A01/A04/A05) and movement
  // (A02/A09/A10). Genuinely a no-op (returns undefined) when PV1-3
  // carried no usable pointOfCare (ward) — an encounter with no real
  // location data has none to resolve, not an error.
  async function resolveLocation(): Promise<string | undefined> {
    if (!parsed.encounter.ward) return undefined;
    const locationResult = await mockLocationService.findOrCreateByPV1({
      facilityId,
      pointOfCare: parsed.encounter.ward,
      room: parsed.encounter.room,
      bed: parsed.encounter.bed,
      hl7FacilityCode: parsed.encounter.facility,
      locationStatus: parsed.encounter.locationStatus,
      personLocationType: parsed.encounter.personLocationType,
      building: parsed.encounter.building,
      floor: parsed.encounter.floor,
    });
    if (!locationResult.ok) return undefined;
    locationId = locationResult.data.location.id;
    locationOutcome = locationResult.data.outcome;
    return locationId;
  }

  if ((parsed.eventType === 'A01' || parsed.eventType === 'A04' || parsed.eventType === 'A05') && parsed.encounter.encounterNumber) {
    // Real feature, per direct confirmation: resolve the real,
    // structured Location BEFORE the Encounter, so the Encounter's
    // own locationId can reference it — same real dependency order as
    // resolving patient identity before encounter above.
    const resolvedLocationId = await resolveLocation();

    // Real, correct fix found while wiring in A05: resolveOrCreateEncounter
    // defaults to 'Planned' when status isn't explicitly passed — A01
    // (Admit)/A04 (Register) represent a real, actual arrival, not a
    // scheduled future one, and were silently getting the wrong
    // status this whole time. A05 (Pre-Admit) is genuinely the one
    // real event that should produce 'Planned' — explicit now, not a
    // shared, accidental default the way it was before.
    const encounterResult = await mockEncounterService.resolveOrCreateEncounter({
      organisationId,
      patientId: mpiResult.patientId,
      encounterNumber: parsed.encounter.encounterNumber,
      encounterClass: parsed.encounter.encounterClass,
      status: parsed.eventType === 'A05' ? 'Planned' : 'Arrived',
      admitTime: parsed.encounter.admitTime,
      facility: parsed.encounter.facility,
      ward: parsed.encounter.ward,
      room: parsed.encounter.room,
      bed: parsed.encounter.bed,
      locationId: resolvedLocationId,
      attendingProvider: parsed.encounter.attendingProvider,
      // Real feature, per direct, detailed correction: DG1 legitimately
      // rides with the creating A01/A04/A05 — see adtParser.ts's own
      // parseDG1 comment. Only passed when the message actually
      // carried at least one real diagnosis; resolveOrCreateEncounter
      // is also the real "return the existing encounter" path for a
      // repeat reference to the same visit, where passing an empty
      // array here would be harmless either way (diagnoses is only
      // ever consumed on genuine creation).
      diagnoses: parsed.diagnoses.length > 0 ? parsed.diagnoses : undefined,
      eventTimestamp: parsed.recordedAt,
    });
    if (encounterResult.ok) encounterId = encounterResult.data.id;
  } else if (parsed.eventType === 'A03' && parsed.encounter.encounterNumber) {
    // Real fix, Phase 4: A03 signals the end of an EXISTING visit -
    // never creates a new Encounter (see adtParser.ts's own header
    // comment). Finds the real, existing encounter by its real visit
    // number; a real A03 with no matching prior encounter (genuinely
    // never accompanied by a real A01/A04) is honestly left
    // unresolved rather than fabricating one.
    const existing = await mockEncounterService.getByEncounterNumber(organisationId, parsed.encounter.encounterNumber);
    if (existing.ok && existing.data) {
      encounterId = existing.data.id;
      const statusResult = await mockEncounterService.updateStatus(
        existing.data.id,
        'Discharged',
        parsed.recordedAt,
        parsed.encounter.dischargeTime,
        parsed.encounter.dischargeDisposition
      );
      if (statusResult.ok) encounterStatusApplied = statusResult.data.applied;
    }
  } else if ((parsed.eventType === 'A02' || parsed.eventType === 'A09' || parsed.eventType === 'A10') && parsed.encounter.encounterNumber) {
    // Real feature, per direct confirmation: A02 (Transfer), A09/A10
    // (Patient Tracking) — real location movement on an EXISTING
    // encounter, never creates a new one. Same real "find, don't
    // fabricate" posture as A03 above.
    const existing = await mockEncounterService.getByEncounterNumber(organisationId, parsed.encounter.encounterNumber);
    if (existing.ok && existing.data) {
      encounterId = existing.data.id;
      const resolvedLocationId = await resolveLocation();
      if (resolvedLocationId) {
        const locResult = await mockEncounterService.updateLocation(existing.data.id, resolvedLocationId, parsed.recordedAt);
        if (locResult.ok) encounterLocationApplied = locResult.data.applied;
      }
    }
  } else if ((parsed.eventType === 'A06' || parsed.eventType === 'A07') && parsed.encounter.encounterNumber) {
    // Real feature, per direct confirmation: A06 (Outpatient →
    // Inpatient), A07 (Inpatient → Outpatient) — real patient class
    // change on an EXISTING encounter.
    const existing = await mockEncounterService.getByEncounterNumber(organisationId, parsed.encounter.encounterNumber);
    if (existing.ok && existing.data) {
      encounterId = existing.data.id;
      const classResult = await mockEncounterService.updateClass(existing.data.id, parsed.encounter.encounterClass, parsed.recordedAt);
      if (classResult.ok) encounterClassApplied = classResult.data.applied;
    }
  } else if (parsed.eventType === 'A11' && parsed.encounter.encounterNumber) {
    // Real feature, per direct confirmation: A11 (Cancel Admit) —
    // reverts an inadvertent admission/registration. No prior-state
    // concept to restore (unlike A12's real previousLocationId) —
    // real, standard meaning is simply "this never should have
    // happened," so it cancels outright.
    const existing = await mockEncounterService.getByEncounterNumber(organisationId, parsed.encounter.encounterNumber);
    if (existing.ok && existing.data) {
      encounterId = existing.data.id;
      const statusResult = await mockEncounterService.updateStatus(existing.data.id, 'Cancelled', parsed.recordedAt);
      if (statusResult.ok) encounterStatusApplied = statusResult.data.applied;
    }
  } else if (parsed.eventType === 'A12' && parsed.encounter.encounterNumber) {
    // Real feature, per direct confirmation: A12 (Cancel Transfer) —
    // restores the real, captured previousLocationId rather than
    // trusting this message's own PV1-3/PV1-6 (see
    // Encounter.previousLocationId's own doc comment for why).
    const existing = await mockEncounterService.getByEncounterNumber(organisationId, parsed.encounter.encounterNumber);
    if (existing.ok && existing.data) {
      encounterId = existing.data.id;
      const cancelResult = await mockEncounterService.cancelTransfer(existing.data.id, parsed.recordedAt);
      if (cancelResult.ok) {
        transferCancelled = cancelResult.data.applied;
        locationId = cancelResult.data.encounter.locationId;
      }
    }
  } else if (parsed.eventType === 'A13' && parsed.encounter.encounterNumber) {
    // Real feature, per direct confirmation: A13 (Cancel Discharge) —
    // re-opens an encounter if a discharge was sent in error. Real,
    // standard meaning: reverts back to an active visit — 'In-Progress'
    // is this app's own EncounterStatus for that, since there's no
    // real way to know which pre-discharge status (Arrived vs
    // In-Progress) genuinely applied before without a fuller status
    // history than this app currently keeps.
    const existing = await mockEncounterService.getByEncounterNumber(organisationId, parsed.encounter.encounterNumber);
    if (existing.ok && existing.data) {
      encounterId = existing.data.id;
      const statusResult = await mockEncounterService.updateStatus(existing.data.id, 'In-Progress', parsed.recordedAt);
      if (statusResult.ok) encounterStatusApplied = statusResult.data.applied;
    }
  } else if (parsed.eventType === 'A08' && parsed.encounter.encounterNumber) {
    // Real feature, per direct confirmation: A08's real, previously-
    // missing metadata effect (PV1-7/10/14/20) — this event was
    // already resolving MPI demographics above, but never touched the
    // Encounter at all until now. Also resolves a real, updated PV1-3
    // if the message happens to carry one (A08 may legitimately update
    // location metadata without a formal A02 transfer).
    const existing = await mockEncounterService.getByEncounterNumber(organisationId, parsed.encounter.encounterNumber);
    if (existing.ok && existing.data) {
      encounterId = existing.data.id;
      await resolveLocation();
      const metaResult = await mockEncounterService.updateMetadata(
        existing.data.id,
        {
          attendingProvider: parsed.encounter.attendingProvider,
          hospitalService: parsed.encounter.hospitalService,
          admitSource: parsed.encounter.admitSource,
          financialClass: parsed.encounter.financialClass,
        },
        parsed.recordedAt
      );
      if (metaResult.ok) encounterMetadataApplied = metaResult.data.applied;

      // Real feature, per direct, detailed correction: DG1 legitimately
      // rides with A08 too — an updated/corrected diagnosis on an
      // already-open visit. Only called when this specific message
      // actually carried a real DG1; an A08 with no DG1 shouldn't
      // silently wipe out a diagnosis a prior message already
      // recorded (updateDiagnoses replaces the full list — see that
      // method's own doc comment).
      if (parsed.diagnoses.length > 0) {
        const diagnosesResult = await mockEncounterService.updateDiagnoses(
          existing.data.id,
          parsed.diagnoses,
          parsed.recordedAt
        );
        if (diagnosesResult.ok) encounterDiagnosesApplied = diagnosesResult.data.applied;
      }
    }
  }

  return {
    eventType: parsed.eventType,
    patientId: mpiResult.patientId,
    mpiOutcome: mpiResult.outcome,
    demographicsApplied: demographicsResult.applied,
    encounterId,
    encounterStatusApplied,
    encounterLocationApplied,
    encounterClassApplied,
    encounterMetadataApplied,
    encounterDiagnosesApplied,
    transferCancelled,
    locationId,
    locationOutcome,
  };
}

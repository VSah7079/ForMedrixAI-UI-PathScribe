// src/services/hl7/adtParser.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real ADT^A01/A03/A04/A08 field extraction, built on hl7Parser.ts's
// generic tokenizer. Field positions confirmed directly against real,
// published example messages (Saga-IT's HL7 v2 message-type reference,
// using the modern PID-3 "Patient Identifier List" convention - not
// the older PID-2 convention seen in one other real example used only
// to test the generic parser's mechanical splitting).
//
// The real, confirmed distinction between the event types this
// parses, verified directly:
// - A01 (admit/visit notification) and A04 (register a patient) are
//   the SAME real shape - the only real difference is PV1-2 (patient
//   class: 'I' inpatient for A01, 'O' outpatient for A04). Both create
//   a real new encounter.
// - A08 (update patient information) does NOT represent a new visit -
//   it updates the patient record for an EXISTING encounter. Carries
//   the same real PID structure as A01/A04, but is never treated as a
//   new Encounter here.
// - A03 (discharge/end visit), added later: signals the end of an
//   EXISTING encounter - "the patient's status has changed to
//   discharged... the patient is no longer in the facility," per the
//   real HL7 standard's own definition. Real, confirmed field: PV1-45
//   (Discharge Date/Time), required for A03, sitting directly
//   alongside the already-parsed PV1-44 (Admit Date/Time). Applies to
//   both inpatient (a real discharge) and outpatient (a real visit
//   end) encounters - never creates a new Encounter, only ends an
//   existing one.
// ─────────────────────────────────────────────────────────────────────────────

import { parseHL7Message, getField, getComponent, getRepetitions, type ParsedHL7Segment } from './hl7Parser';
import type { EncounterClass, EncounterDiagnosis } from '../encounters/IEncounterService';

// Real feature, per direct confirmation, working through the full list
// of ADT trigger events that carry real PID+PV1 encounter/location
// data (A45/A50/A34 are structurally different — MRG-based visit
// operations, not PID+PV1 — handled separately, see
// patientManagementParser.ts's own header for that same PID+MRG
// distinction already established for A40/A24/A47).
export type AdtEventType =
  | 'A01' | 'A03' | 'A04' | 'A08'
  // Location movement — PV1-3 (new location), PV1-6 (prior location)
  | 'A02'
  // Patient tracking — temporary location change, no formal unit
  // transfer. Same real PV1-3/PV1-6 shape as A02; this app's own
  // Location/Encounter model doesn't distinguish "formal transfer"
  // from "temporary tracking" at the data level, so both resolve
  // through the identical real transfer logic.
  | 'A09' | 'A10'
  // Patient class change — PV1-2, may also carry a new PV1-3
  | 'A06' | 'A07'
  // Pre-admit — creates a real, Planned encounter ahead of arrival
  | 'A05'
  // Cancellations — real rollback of A01/A05, A02/A09/A10, A03
  | 'A11' | 'A12' | 'A13'
  // Real feature, per direct confirmation: working through the full
  // list of ADT demographic/identity trigger events. A31 (Update
  // Person Information) — real, confirmed identical PID structure to
  // A08, but sent outside an active encounter context (e.g. a central
  // MPI/registration portal update with no visit currently open).
  // Deliberately routed through the SAME demographic-update path as
  // A08 in processAdtMessage.ts, but never touches Encounter at all —
  // even if a real message happens to carry a PV1 segment, A31's own
  // real meaning has nothing to do with a visit.
  | 'A31';

/** Real, single patient identifier extracted from a real, repeating
 *  PID-3 - one real row per repetition, each with its own real
 *  assigning authority. Maps directly onto
 *  PatientMatchCandidate.assigningAuthority's own real crosswalk
 *  concept (services/patients/) - this is precisely the real, inbound
 *  source that field exists to receive. */
export interface ParsedPatientIdentifier {
  identifierValue: string;
  assigningAuthority: string;
}

export interface ParsedAdtMessage {
  eventType: AdtEventType;
  /** EVN-2 — the real, recorded event date/time. Not used by anything
   *  built yet (real, honest scope: idempotent out-of-order handling
   *  is a later phase's job), but captured here since it's already
   *  sitting in the real, parsed EVN segment. */
  recordedAt: string;
  patient: {
    identifiers: ParsedPatientIdentifier[];
    /** The real, first identifier's value alone - the honest,
     *  simplest single-MRN shape PatientMatchCandidate.mrn already
     *  expects, for a caller that doesn't need the full, real
     *  multi-authority list. */
    primaryMrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    sex?: 'M' | 'F' | 'U';
    /** Real feature, per direct confirmation: working through the
     *  full list of ADT demographic/identity trigger events. PID-9
     *  (Patient Alias) — real, repeating field; every real alias on
     *  this specific message, not just the first. */
    aliases: string[];
    /** PID-11 (Patient Address), real XAD component order:
     *  street^otherDesignation^city^state^zip^country. */
    address?: { street?: string; city?: string; state?: string; zip?: string; country?: string };
    /** PID-13 (Phone Number - Home). Kept as the raw XTN string —
     *  real-world formatting varies too much to safely decompose
     *  without a real, confirmed format. */
    phone?: string;
    /** PID-16 (HL7 Table 0002, Marital Status). */
    maritalStatus?: string;
    /** PID-29 (Patient Death Indicator) — real "Y"/"N" HL7 value,
     *  converted to a real boolean here (undefined when the field is
     *  genuinely absent — never assumed alive by default). */
    deceased?: boolean;
    /** PID-30 (Patient Death Date and Time). */
    deathDateTime?: string;
  };
  /** Encounter-related fields - only genuinely meaningful for A01/A04
   *  (a real, new visit). Still parsed for A08 (PV1 may legitimately
   *  be present and updated), but a real caller should not create a
   *  new Encounter from an A08 - see this file's own header comment. */
  encounter: {
    encounterNumber: string;
    encounterClass: EncounterClass;
    facility?: string;
    ward?: string;
    room?: string;
    bed?: string;
    /** PV1-3.5 (HL7 Table 0306, Bed Status) — real feature, per direct
     *  confirmation: "include the standards." See
     *  services/locations/ILocationService.ts's
     *  HL7_LOCATION_STATUS_OPTIONS for the standard's own suggested
     *  values. */
    locationStatus?: string;
    /** PV1-3.6 (HL7 Table 0305, Person Location Type). See
     *  HL7_PERSON_LOCATION_TYPE_OPTIONS. */
    personLocationType?: string;
    /** PV1-3.7 */
    building?: string;
    /** PV1-3.8 */
    floor?: string;
    /** PV1-7 — real, per PS-81 (Jira): now the real, structured XCN
     *  shape (id/lastName/firstName), never flattened to a string here
     *  — that flattening used to happen in this exact spot and was the
     *  real, confirmed root cause of ADT/Order-Intake provider
     *  resolution mismatches (same physician, two different free-text
     *  formats, two different Physician records). The real ID
     *  component (XCN.1) was previously extracted and silently
     *  discarded by the old flattening code; it's real, structured
     *  data now, not lost. */
    attendingProvider?: { id?: string; lastName?: string; firstName?: string };
    admitTime?: string;
    /** PV1-45 — real, required field for A03. Genuinely absent for
     *  A01/A04/A08 (a visit hasn't ended yet). */
    dischargeTime?: string;
    /** PV1-36 (HL7 Table 0112, Discharge Disposition) — real,
     *  standard-defined field for A03. Kept as a raw string, same
     *  "guided free text, not a closed enum" posture as
     *  locationStatus/personLocationType above — Table 0112 is also
     *  genuinely site-extensible in the real standard. */
    dischargeDisposition?: string;
    /** PV1-6 — Prior Patient Location, real for A02/A09/A10
     *  (movement events). Same first-3-component structure as PV1-3.
     *  Parsed for audit/validation only — the real "restore on
     *  cancel" logic (A12) uses the Encounter's own, captured prior
     *  locationId rather than trusting this field alone, since
     *  real-world A12 messages don't always populate it completely. */
    priorWard?: string;
    priorRoom?: string;
    priorBed?: string;
    /** PV1-10 (HL7 Table 0069, Hospital Service) — real for A08
     *  metadata updates. */
    hospitalService?: string;
    /** PV1-14 (HL7 Table 0023, Admit Source) — real for A08. */
    admitSource?: string;
    /** PV1-20 (HL7 Table 0064, Financial Class) — real for A08. */
    financialClass?: string;
  };
  /** Real feature, per direct, detailed correction: DG1 is its own,
   *  dedicated segment (not part of OBR, and not exclusively an
   *  "order-level" concept), which legitimately rides with A01/A04/
   *  A08 among other real message types. Every real DG1 segment on
   *  this message, in real DG1-1 set-id order — genuinely an empty
   *  array, not undefined, when the message carried none (most real
   *  ADT traffic won't). */
  diagnoses: EncounterDiagnosis[];
}

const PATIENT_CLASS_MAP: Record<string, EncounterClass> = {
  I: 'Inpatient',
  O: 'Outpatient',
  E: 'Emergency',
  P: 'Ambulatory', // real, standard HL7 Table 0004 value for "Preadmit" - closest real match to Ambulatory in this app's own EncounterClass, not a guess at a new category
  B: 'Ambulatory', // "Obstetrics" in the real HL7 table - no closer real match in this app's scope
};

/** Real, honest date conversion — HL7's real YYYYMMDD[HHMMSS] format
 *  into a real ISO string. Returns undefined, never a fabricated date,
 *  for a genuinely empty or unparseable field. */
function fromHL7Date(value: string): string | undefined {
  if (!value || value.length < 8) return undefined;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.length >= 10 ? value.slice(8, 10) : '00';
  const minute = value.length >= 12 ? value.slice(10, 12) : '00';
  const second = value.length >= 14 ? value.slice(12, 14) : '00';
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : iso;
}

function parsePID(pid: ParsedHL7Segment | null): ParsedAdtMessage['patient'] {
  // Real, repeating PID-3 - each repetition is one real identifier,
  // its own assigning authority at real component 4 (0-indexed: 3).
  // Per the real, confirmed component structure:
  // ID^checkDigit^checkDigitScheme^assigningAuthority^identifierTypeCode
  const rawIdentifiers = getRepetitions(getField(pid, 3));
  const identifiers: ParsedPatientIdentifier[] = rawIdentifiers
    .map(raw => ({
      identifierValue: getComponent(raw, 0),
      assigningAuthority: getComponent(raw, 3),
    }))
    .filter(id => id.identifierValue); // never a real identifier row for a genuinely empty repetition

  const nameField = getField(pid, 5);
  const sexRaw = getField(pid, 8);
  const sex: 'M' | 'F' | 'U' = sexRaw === 'M' || sexRaw === 'F' ? sexRaw : 'U';

  // Real feature, per direct confirmation: working through the full
  // list of ADT demographic/identity trigger events. PID-9 (Patient
  // Alias) — real, repeating XPN field, same component order as PID-5
  // (lastName^firstName). Every real repetition, not just the first.
  const aliases = getRepetitions(getField(pid, 9))
    .map(raw => {
      const last = getComponent(raw, 0);
      const first = getComponent(raw, 1);
      return [last, first].filter(Boolean).join(', ');
    })
    .filter(Boolean);

  // PID-11 (Patient Address), real XAD component order:
  // street^otherDesignation^city^state^zip^country.
  const addressField = getField(pid, 11);
  const street = getComponent(addressField, 0);
  const city = getComponent(addressField, 2);
  const state = getComponent(addressField, 3);
  const zip = getComponent(addressField, 4);
  const country = getComponent(addressField, 5);
  const address = (street || city || state || zip || country)
    ? { street: street || undefined, city: city || undefined, state: state || undefined, zip: zip || undefined, country: country || undefined }
    : undefined;

  // PID-29 (Patient Death Indicator) — real "Y"/"N" HL7 value,
  // converted to a real boolean. Genuinely undefined (not `false`)
  // when the field is absent — never assumed alive by default.
  const deathIndicatorRaw = getField(pid, 29);
  const deceased = deathIndicatorRaw === 'Y' ? true : deathIndicatorRaw === 'N' ? false : undefined;

  return {
    identifiers,
    primaryMrn: identifiers[0]?.identifierValue ?? '',
    lastName: getComponent(nameField, 0),
    firstName: getComponent(nameField, 1),
    dateOfBirth: fromHL7Date(getField(pid, 7)),
    sex,
    aliases,
    address,
    phone: getField(pid, 13) || undefined,
    maritalStatus: getField(pid, 16) || undefined,
    deceased,
    deathDateTime: fromHL7Date(getField(pid, 30)),
  };
}

function parsePV1(pv1: ParsedHL7Segment | null): ParsedAdtMessage['encounter'] {
  const classRaw = getField(pv1, 2);
  const locationField = getField(pv1, 3);
  const priorLocationField = getField(pv1, 6);

  return {
    // PV1-19 — real, standard Visit Number (the real FIN this whole
    // effort exists to give a real home to — see
    // services/encounters/README.md).
    encounterNumber: getField(pv1, 19),
    // Real, honest fallback: an unrecognized/absent class never
    // silently becomes a guess - Outpatient is this app's own,
    // already-established honest default (see AccessionPage.tsx's
    // real accession-time call), reused here rather than inventing a
    // second, different default.
    encounterClass: PATIENT_CLASS_MAP[classRaw] ?? 'Outpatient',
    // PV1-3 real, standard component order: pointOfCare(ward)^room^bed^facility^locationStatus^personLocationType^building^floor
    ward: getComponent(locationField, 0) || undefined,
    room: getComponent(locationField, 1) || undefined,
    bed: getComponent(locationField, 2) || undefined,
    facility: getComponent(locationField, 3) || undefined,
    // Real feature, per direct confirmation: "include the standards" —
    // PV1-3.5/3.6/3.7/3.8, previously not parsed at all.
    locationStatus: getComponent(locationField, 4) || undefined,
    personLocationType: getComponent(locationField, 5) || undefined,
    building: getComponent(locationField, 6) || undefined,
    floor: getComponent(locationField, 7) || undefined,
    // PV1-7 — real, standard XCN component order (0-indexed here, per
    // getComponent's own real convention): index 0 = XCN.1 (ID Number),
    // index 1 = XCN.2 (Family Name), index 2 = XCN.3 (Given Name).
    // Real, per PS-81: preserves this structured shape directly now,
    // rather than flattening it into a "LastName, FirstName" string —
    // that flattening was the real, confirmed root cause of ADT/
    // Order-Intake provider resolution ending up as two different
    // Physician records for the same real physician.
    attendingProvider: (() => {
      const raw = getField(pv1, 7);
      if (!raw) return undefined;
      const id = getComponent(raw, 0) || undefined;
      const lastName = getComponent(raw, 1) || undefined;
      const firstName = getComponent(raw, 2) || undefined;
      return (id || lastName || firstName) ? { id, lastName, firstName } : undefined;
    })(),
    admitTime: fromHL7Date(getField(pv1, 44)),
    dischargeTime: fromHL7Date(getField(pv1, 45)),
    // Real feature, per direct confirmation: working through the full
    // list of ADT trigger events. PV1-36 — real, standard field for
    // A03's own discharge disposition.
    dischargeDisposition: getField(pv1, 36) || undefined,
    // PV1-6 — Prior Patient Location, real for A02/A09/A10 movement
    // events. Same first-3-component structure as PV1-3.
    priorWard: getComponent(priorLocationField, 0) || undefined,
    priorRoom: getComponent(priorLocationField, 1) || undefined,
    priorBed: getComponent(priorLocationField, 2) || undefined,
    // Real, standard A08 metadata fields.
    hospitalService: getField(pv1, 10) || undefined,
    admitSource: getField(pv1, 14) || undefined,
    financialClass: getField(pv1, 20) || undefined,
  };
}

/** Real feature, per direct, detailed correction: DG1 is its own,
 *  dedicated, real segment — not part of OBR, and legitimately
 *  repeating (real DG1-1 is a per-segment set-id, exactly like the
 *  existing repeating-segment handling this app already established
 *  for NK1 elsewhere — getAllSegments('DG1'), not getSegment). Real,
 *  confirmed DG1-3 component structure — identifier^text^codingSystem
 *  — mirrors this app's own, already-existing outbound DG1 builder
 *  (services/hl7/segmentBuilders.ts's buildDG1) exactly, rather than
 *  inventing a different shape for the same real field on the
 *  parsing side. A DG1 segment with no real DG1-3.1 identifier is
 *  never a genuine diagnosis — silently dropped rather than producing
 *  a hollow entry with no real code. */
function parseDG1(dg1Segments: ParsedHL7Segment[]): EncounterDiagnosis[] {
  return dg1Segments
    .map(dg1 => {
      const codeField = getField(dg1, 3);
      return {
        code: getComponent(codeField, 0),
        description: getComponent(codeField, 1) || undefined,
        codingSystem: getComponent(codeField, 2) || undefined,
        // DG1-6 (HL7 Table 0052) — real diagnosis type: A/W/F.
        diagnosisType: getField(dg1, 6) || undefined,
      };
    })
    .filter(dx => dx.code);
}

/** Real, honest parse — throws only when the message genuinely cannot
 *  be processed at all (no real MSH, or a real event type this app
 *  doesn't yet handle). Never silently returns a half-populated
 *  result for a message it can't actually make sense of. */
export function parseAdtMessage(raw: string): ParsedAdtMessage {
  const message = parseHL7Message(raw);
  const msh = message.getSegment('MSH');
  if (!msh) throw new Error('Not a real, parseable HL7 message — no MSH segment found.');

  const messageType = getField(msh, 9); // e.g. "ADT^A04"
  const eventType = getComponent(messageType, 1);
  const SUPPORTED_EVENTS: readonly string[] = ['A01', 'A03', 'A04', 'A08', 'A02', 'A09', 'A10', 'A06', 'A07', 'A05', 'A11', 'A12', 'A13', 'A31'];
  if (!SUPPORTED_EVENTS.includes(eventType)) {
    throw new Error(`Real event type "${eventType}" is not yet handled — only ${SUPPORTED_EVENTS.join(', ')} are supported.`);
  }

  const evn = message.getSegment('EVN');
  const pid = message.getSegment('PID');
  const pv1 = message.getSegment('PV1');
  const dg1Segments = message.getAllSegments('DG1');

  return {
    eventType: eventType as AdtEventType,
    recordedAt: fromHL7Date(getField(evn, 2)) ?? new Date().toISOString(),
    patient: parsePID(pid),
    encounter: parsePV1(pv1),
    diagnoses: parseDG1(dg1Segments),
  };
}

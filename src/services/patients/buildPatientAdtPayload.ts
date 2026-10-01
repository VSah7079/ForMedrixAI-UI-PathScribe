// src/services/patients/buildPatientAdtPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("we trigger the json packages and the
// interface engine generates the formatted messages") and the
// attached Pathology HL7 Outbound Feature Spec, Section 4: three real
// JSON payload builders — one per ADT event that spec's own registry
// actually requires (A08 Demographic Update, A40 Merge Patient, A47
// Change Identifier). Same real posture as jsonWebhookBuilder.ts's own
// ChargeCaptureEventPayload: PathScribe never constructs an HL7
// string itself — these are the raw, real facts an interface engine
// needs to build MRG-1 (A40), the identifier swap (A47), or the PID
// update (A08) itself.
//
// Unlike ChargeCaptureEventPayload's own reference/full PHI-
// minimization split (gated on match confidence), every payload here
// always carries full patient identity — a merge, identifier swap, or
// demographic correction is fundamentally an identity-reconciliation
// event; the interface engine cannot act on any of these without
// knowing exactly which real-world person(s) are involved, regardless
// of how confident PathScribe's own original match was.
//
// Same real PRE-INTEGRATION SCAFFOLDING posture as
// jsonWebhookBuilder.ts/dftBuilder.ts — nothing dispatches this yet,
// no real HTTP transport exists. These builders exist so a real
// dispatch mechanism, once built, has a real, tested, correct payload
// shape to send — not so this pass can claim messages are actually
// being sent, which they are not.
// ─────────────────────────────────────────────────────────────────────────────

import { mockPatientIndexService } from './mockPatientIndexService';
import type { PatientIdentifier } from './IPatientIndexService';

interface PatientIdentitySnapshot {
  patientId: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  /** Every real, known identifier this lab has ever recorded for this
   *  patient, across every source system — the real, multi-authority
   *  crosswalk MRG-1 (A40) needs, not just the one MRN PathScribe
   *  itself assigned. */
  identifiers: PatientIdentifier[];
}

async function snapshotPatient(patientId: string): Promise<PatientIdentitySnapshot | null> {
  const record = await mockPatientIndexService.getById(patientId);
  if (!record) return null;
  const identifiersRes = await mockPatientIndexService.listIdentifiersForPatient(patientId);
  return {
    patientId: record.id,
    mrn: record.mrn,
    firstName: record.firstName,
    lastName: record.lastName,
    dateOfBirth: record.dateOfBirth,
    identifiers: identifiersRes,
  };
}

export interface Adt08DemographicUpdatePayload {
  messageId: string;
  eventType: 'A08_DEMOGRAPHIC_UPDATE';
  eventTimestamp: string;
  organisationId: string;
  patient: PatientIdentitySnapshot;
}

export interface Adt40MergePatientPayload {
  messageId: string;
  eventType: 'A40_MERGE_PATIENT';
  eventTimestamp: string;
  organisationId: string;
  /** MRG-1 (Prior Patient Identifier List) — the real, merged-away
   *  identity, per the spec's own field name. */
  priorPatient: PatientIdentitySnapshot;
  /** The real, surviving, now-canonical identity. */
  survivingPatient: PatientIdentitySnapshot;
  casesRepointed: number;
  encountersRepointed: number;
}

export interface Adt47ChangeIdentifierPayload {
  messageId: string;
  eventType: 'A47_CHANGE_IDENTIFIER';
  eventTimestamp: string;
  organisationId: string;
  /** The real, temporary/downtime identity being replaced — per the
   *  spec's own "Swaps temporary 'Trauma/Unidentified' specimen
   *  tracking numbers for confirmed medical record identifiers." */
  priorIdentity: PatientIdentitySnapshot;
  confirmedIdentity: PatientIdentitySnapshot;
  reasonCode: string;
  notes: string;
  casesRepointed: number;
}

export async function buildAdt08Payload(patientId: string, organisationId: string): Promise<Adt08DemographicUpdatePayload | null> {
  const patient = await snapshotPatient(patientId);
  if (!patient) return null;
  return {
    messageId: `adt08-${patientId}-${Date.now().toString(36)}`,
    eventType: 'A08_DEMOGRAPHIC_UPDATE',
    eventTimestamp: new Date().toISOString(),
    organisationId,
    patient,
  };
}

export async function buildAdt40Payload(
  priorPatientId: string, survivingPatientId: string, organisationId: string, casesRepointed: number, encountersRepointed: number
): Promise<Adt40MergePatientPayload | null> {
  const [priorPatient, survivingPatient] = await Promise.all([snapshotPatient(priorPatientId), snapshotPatient(survivingPatientId)]);
  if (!priorPatient || !survivingPatient) return null;
  return {
    messageId: `adt40-${priorPatientId}-${Date.now().toString(36)}`,
    eventType: 'A40_MERGE_PATIENT',
    eventTimestamp: new Date().toISOString(),
    organisationId,
    priorPatient,
    survivingPatient,
    casesRepointed,
    encountersRepointed,
  };
}

export async function buildAdt47Payload(
  priorIdentityId: string, confirmedIdentityId: string, organisationId: string, reasonCode: string, notes: string, casesRepointed: number
): Promise<Adt47ChangeIdentifierPayload | null> {
  const [priorIdentity, confirmedIdentity] = await Promise.all([snapshotPatient(priorIdentityId), snapshotPatient(confirmedIdentityId)]);
  if (!priorIdentity || !confirmedIdentity) return null;
  return {
    messageId: `adt47-${priorIdentityId}-${Date.now().toString(36)}`,
    eventType: 'A47_CHANGE_IDENTIFIER',
    eventTimestamp: new Date().toISOString(),
    organisationId,
    priorIdentity,
    confirmedIdentity,
    reasonCode,
    notes,
    casesRepointed,
  };
}

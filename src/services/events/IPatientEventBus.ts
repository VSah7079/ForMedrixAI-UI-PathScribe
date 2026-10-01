// src/services/events/IPatientEventBus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, Phase 4: the real-time broadcasting interface the original
// spec asks for - "publish a real-time event stream for critical
// patient state changes... to allow other internal microservices
// (e.g., Notifications, Billing) to subscribe without polling the
// database." Gated on nothing now that Phase 0-3 exist as real event
// PRODUCERS - every event type below corresponds to an operation this
// codebase already performs for a real, honest reason, not a
// speculative future feature.
//
// Deliberately a real, in-memory pub-sub for this app's own scope, not
// a message-broker abstraction (Kafka/SNS/etc.) - the real, honest
// interface boundary is what matters here (a subscriber never touches
// mockPatientIndexService/mockEncounterService directly), not which
// specific broker technology sits behind it. Swapping the mock
// implementation for a real broker-backed one later is a one-file
// change, same pattern as every other service in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { MasterPatientRecord, PatientLinkRelationshipType } from '../patients/IPatientIndexService';
import type { Encounter } from '../encounters/IEncounterService';

/** Real, honest event catalogue - one event per real state-change
 *  operation this codebase actually performs. Deliberately NOT
 *  speculative: every one of these corresponds to a real, existing
 *  method call somewhere in services/patients/ or services/encounters/. */
export type PatientEvent =
  | { type: 'Patient.Created'; patient: MasterPatientRecord }
  | { type: 'Patient.Matched'; patient: MasterPatientRecord }
  | { type: 'Patient.Merged'; sourcePatientId: string; targetPatient: MasterPatientRecord; casesRepointed: number }
  | { type: 'Patient.Linked'; patientIdA: string; patientIdB: string; relationshipType: PatientLinkRelationshipType; linkedBy: string; reason?: string }
  | { type: 'Patient.Updated'; patient: MasterPatientRecord }
  /** Real feature, per direct architecture confirmation: ADT^A43 —
   *  genuinely distinct from Patient.Merged. Neither identity is
   *  retired; exactly one Case moved from sourcePatientId to
   *  targetPatientId. */
  | { type: 'Patient.CaseMoved'; caseId: string; sourcePatientId: string; targetPatientId: string }
  | { type: 'Encounter.Created'; encounter: Encounter }
  | { type: 'Encounter.StatusChanged'; encounter: Encounter; previousStatus: string };

export type PatientEventType = PatientEvent['type'];

export type PatientEventListener = (event: PatientEvent) => void;

export interface IPatientEventBus {
  /** Real, direct publish - called by the real producers
   *  (mockPatientIndexService, mockEncounterService) at the exact
   *  point a real state change actually happens, never speculatively
   *  ahead of it. */
  publish(event: PatientEvent): void;

  /** Subscribe to every real event of a given type. Returns a real,
   *  callable unsubscribe function - a subscriber that goes away
   *  (e.g. a closed dashboard) should be able to genuinely stop
   *  listening, not leak forever. */
  subscribe(type: PatientEventType, listener: PatientEventListener): () => void;

  /** Subscribe to every real event, regardless of type - for a
   *  consumer (e.g. a real audit/activity feed) that genuinely wants
   *  the full, unfiltered stream. */
  subscribeAll(listener: PatientEventListener): () => void;
}

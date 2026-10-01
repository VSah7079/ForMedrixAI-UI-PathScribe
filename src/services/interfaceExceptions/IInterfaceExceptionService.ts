// src/services/interfaceExceptions/IInterfaceExceptionService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct architecture confirmation: a real inbound
// ADT^A43 (Move Patient Information) that lacks a usable MRG-5 (Prior
// Visit Number), or whose MRG-5 doesn't match any real, known
// Encounter/Case, should never be silently dropped OR auto-moved on a
// guess (moving a diagnostic report to the wrong patient chart is a
// real, serious clinical-safety error, not a cosmetic one). This
// service is that fallback: a real, honest holding queue for
// interface messages this app could not safely auto-resolve, routed
// here instead of processed, for a real human to review.
//
// Deliberately general — scoped by eventType/reason/rawMessage rather
// than anything A43-specific — so the same queue can hold a future
// unresolvable event of a different real type without a redesign.
//
// That design paid off a second time: eventType: 'unmapped_order_code'
// (order-type-mapping work, see services/orderIntake's own
// SpecimenCodeCrosswalkEntry) reuses this same queue/service/UI
// unchanged, for the same reason A40/A24/A47 did — an inbound order
// code the crosswalk couldn't match, in any coding system tried,
// needs a real human review path, not a silent guess. Only the
// optional rawOrderCode/normalizedOrderCode/codingSystem/
// organisationId/siteId fields below are new.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';

export type InterfaceExceptionStatus = 'pending' | 'resolved' | 'dismissed';

export interface InterfaceException {
  id: ID;
  /** The real HL7 event code this message claimed to be (e.g. 'A43'). */
  eventType: string;
  /** Real, honest, human-readable reason this message could not be
   *  auto-resolved — e.g. "No MRG-5 (Prior Visit Number) present" or
   *  "MRG-5 'FIN-9981' does not match any known Encounter." Never
   *  vague ("processing failed") — a real reviewer needs to know
   *  exactly what's missing to fix it. */
  reason: string;
  /** The original, real raw message text — kept so a reviewer can see
   *  exactly what the sending system actually sent, same "paper trail,
   *  not the source of truth once resolved" posture as
   *  IncomingOrder.rawMessage. */
  rawMessage: string;
  /** Real, minimal identity context extracted before the failure, when
   *  available — helps a reviewer triage without re-parsing the raw
   *  message by eye. Genuinely absent when the message failed before
   *  even this much could be extracted. */
  sourcePatientIdentifier?: string;
  targetPatientIdentifier?: string;
  /** Real feature, per direct confirmation: "Show both patients and
   *  their active cases, allowing an operator to select which specific
   *  Case(s) should be reassigned." The REAL, resolved MPI patient ids
   *  — distinct from the raw MRN strings above. `processMoveMessage()`
   *  already resolves both identities (via the same crosswalk every
   *  other real ADT path uses) before deciding a message can't be
   *  safely auto-processed; capturing the real ids here means a
   *  reviewer never has to re-resolve identity by hand from the raw
   *  message. Genuinely absent only if resolution itself failed before
   *  reaching this point (a real, rarer edge case than "MRG-5 didn't
   *  match anything," which still resolves both identities fine). */
  sourcePatientId?: string;
  targetPatientId?: string;
  /** Real fields for eventType: 'unmapped_order_code' — a real, external
   *  order/test code the Specimen Code Crosswalk (see
   *  services/orderIntake/IOrderIntakeService.ts's own
   *  SpecimenCodeCrosswalkEntry) had no match for, in any coding
   *  system tried. Same "deliberately general, add optional fields for
   *  a new real event type rather than a parallel type" posture this
   *  interface's own header already documents — not a new table.
   *  Genuinely absent for every exception type that predates this one
   *  (A40/A24/A43/A47), same as sourcePatientId/targetPatientId are
   *  genuinely absent here. */
  rawOrderCode?: string;
  normalizedOrderCode?: string;
  codingSystem?: string;
  organisationId?: string;
  siteId?: string;
  /** Real, new field, per the real "Map & Link" contextual resolution
   *  feature (Config → Integrations' own Order Types & Inbound Rules
   *  screen, InterfaceExceptionReviewModal.tsx) — the real Facility/
   *  client id (services/facilities/) this unmapped order code came
   *  in on, distinct from organisationId/siteId above (a real,
   *  different concept — see resolveProviderName.ts's own header on
   *  Facility vs Organisation/Site for why these are never
   *  conflated). Needed to correctly scope the real crosswalk entry
   *  a reviewer creates when resolving this exception —
   *  SpecimenCodeCrosswalkEntry.clientId is the same code string
   *  meaning different things at different sending systems, so a
   *  crosswalk entry without a real facilityId can't be created
   *  correctly. Genuinely absent for every exception type that
   *  predates this field. */
  facilityId?: string;
  status: InterfaceExceptionStatus;
  createdAt: string;
  resolvedAt?: string;
  /** Real user id of whoever resolved/dismissed this — same
   *  attribution posture as every other real action in this app. */
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface IInterfaceExceptionService {
  getAll(): Promise<ServiceResult<InterfaceException[]>>;
  getPending(): Promise<ServiceResult<InterfaceException[]>>;
  getById(id: ID): Promise<ServiceResult<InterfaceException>>;
  /** Real, honest routing — called instead of auto-resolving whenever
   *  a real inbound message can't be safely processed. */
  create(input: Omit<InterfaceException, 'id' | 'status' | 'createdAt'>): Promise<ServiceResult<InterfaceException>>;
  /** A real reviewer worked the exception and took the correct real
   *  action manually (e.g. moved the case by hand after confirming the
   *  right target) — marks it closed, with a real note for the audit
   *  trail. */
  resolve(id: ID, resolvedBy: string, note?: string): Promise<ServiceResult<InterfaceException>>;
  /** A real reviewer determined this exception needs no action (e.g.
   *  a genuine duplicate, or the sending system corrected itself with
   *  a later, valid message) — same real attribution as resolve(). */
  dismiss(id: ID, resolvedBy: string, note?: string): Promise<ServiceResult<InterfaceException>>;
}

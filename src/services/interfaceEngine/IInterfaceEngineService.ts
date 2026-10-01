// src/services/interfaceEngine/IInterfaceEngineService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the JSON/REST interface specification
// (see PathScribe_Interface_Specification_v1.1.docx, §7): the actual real
// trigger for a Category E OrderCreated event — not just the documented
// payload shape, the real code that constructs and dispatches one.
//
// Real, per direct follow-up ("Address the fifth transaction type:
// interfaceEngine's OrderCreated" — real outbound HTTP dispatch
// transport, closing the gap this file's own header once described):
// mockInterfaceEngineService.ts now genuinely dispatches, via the same
// real, generic receiving endpoint every other real transaction type
// in this app uses (receive_interface_message,
// services/interfaceDispatch/dispatchInterfaceMessage.ts) — not a
// separate, dedicated OrderCreated endpoint. The real, local
// record-keeping this file already had (localStorage, idempotency on
// messageId, listDispatchedEvents) stays exactly as it was — a real,
// separate concern from whether the real dispatch itself succeeded,
// same distinction every other real outbound queue in this app already
// draws between "enqueued" and "sent." The interface itself is
// unchanged in shape (still `postOrderCreated`/`listDispatchedEvents`)
// — every real call site (AccessionPage.tsx) stays exactly the same,
// per this file's own original design intent.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

/** Mirrors the formal spec's §2.6 patient-data-minimization requirement
 *  exactly — see that document for the full reasoning. */
export interface OrderCreationPatient {
  patientDataScope: 'reference' | 'full';
  identifier: string;
  assigningAuthority?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  sex?: 'M' | 'F' | 'U';
}

export interface OrderCreationEncounter {
  encounterNumber: string;
  encounterClass?: 'Inpatient' | 'Outpatient' | 'Emergency' | 'Ambulatory' | 'Virtual';
  location?: { pointOfCare: string; room?: string; bed?: string };
}

export interface OrderCreationOrder {
  placerOrderNumber: string;
  /** Real fix, found while implementing this against the actual codebase:
   *  the spec's own first draft said 'ASAP', copied from the original HL7
   *  ORM^O01 draft's own priority codes without cross-checking this app's
   *  real Case.order.priority type — confirmed directly against
   *  types/case/Case.ts: the real value is 'Rush', not 'ASAP'. Fixed here,
   *  and in the formal spec document itself. */
  priority: 'Routine' | 'Rush' | 'STAT';
  orderingProvider?: {
    npi?: string;
    lastName?: string;
    firstName?: string;
    contactPhone?: string;
    /** Real, honest accommodation found while implementing this: this
     *  app's own Case.order.requestingProvider is a single, real
     *  free-text field ("Dr. Jane Smith") — never split into structured
     *  first/last name parts anywhere in the actual data model. Rather
     *  than misleadingly cramming the whole free-text string into
     *  `lastName` (which a downstream system would reasonably read as
     *  just a surname), this carries it as-is. A real caller with
     *  genuinely structured name data can still populate
     *  firstName/lastName instead. */
    rawName?: string;
  };
  clinicalIndication?: string;
}

export interface OrderCreationDiagnosis {
  code: string;
  description?: string;
  isPrincipal: boolean;
}

export interface OrderCreationSpecimen {
  label: string;
  source?: string;
  bodySite?: string;
  bodySiteCode?: string;
  collectionMethod?: string;
  collectionDateTime?: string;
  containerType?: string;
  fixative?: string;
  grossDescriptionNote?: string;
}

/** Matches PathScribe_Interface_Specification_v1.1.docx §7.1 exactly. */
export interface OrderCreationEventPayload {
  messageId: string;
  eventType: 'OrderCreated';
  eventTimestamp: string;
  organisationId: string;
  facilityId?: string;
  patient: OrderCreationPatient;
  encounter?: OrderCreationEncounter;
  order: OrderCreationOrder;
  diagnoses?: OrderCreationDiagnosis[];
  specimens: OrderCreationSpecimen[];
}

/** What happened when PathScribe sent an OrderCreated event (Batch 318, PS-86).
 *  - 'delivered': the receiving endpoint accepted it;
 *  - 'failed': the send failed (timeout, unreachable, or rejected), see `error`;
 *  - 'recorded': recorded before outcomes were stored, so the outcome is unknown. */
export type DispatchOutcomeStatus = 'delivered' | 'failed' | 'recorded';

export interface DispatchOutcome {
  status: Exclude<DispatchOutcomeStatus, 'recorded'>;
  attemptedAt: string;
  /** How many send attempts have been made (a redelivered, previously failed event is re-sent). */
  attempts: number;
  error?: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
}

/** One row of the Audit Log's Outbound Dispatches trail: the event exactly as
 *  it was sent, plus its dispatch outcome. */
export interface OrderCreatedDispatchRecord {
  payload: OrderCreationEventPayload;
  status: DispatchOutcomeStatus;
  attemptedAt?: string;
  attempts?: number;
  error?: string;
  errorCode?: DispatchOutcome['errorCode'];
}

export interface IInterfaceEngineService {
  /**
   * Dispatches a real Category E OrderCreated event.
   *
   * Real, per direct follow-up ("Address the fifth transaction type:
   * interfaceEngine's OrderCreated" — real outbound HTTP dispatch
   * transport): `delivered` now means what this field's own original
   * doc comment always said it eventually should — a real dispatch to
   * the real receiving endpoint (receive_interface_message,
   * services/interfaceDispatch/dispatchInterfaceMessage.ts) genuinely
   * succeeded, not just that the mock recorded it locally. `error` is
   * present when `delivered` is false, naming the real reason.
   */
  postOrderCreated(payload: OrderCreationEventPayload): Promise<ServiceResult<{ delivered: boolean; error?: string }>>;

  /** Real, dedicated inspection method — for tests and for a future real
   *  admin UI showing "what would have gone out." Returns every event
   *  dispatched so far, most-recent-first. */
  listDispatchedEvents(organisationId: string): Promise<ServiceResult<OrderCreationEventPayload[]>>;

  /** The Audit Log's Outbound Dispatches trail (PS-86): every recorded
   *  OrderCreated event with its dispatch outcome, most-recent-first.
   *  Deliberately not organisation-scoped, like the Audit Log's other
   *  Interfaces views: it is an administrator's system-wide view. */
  listDispatchTrail(): Promise<ServiceResult<OrderCreatedDispatchRecord[]>>;
}

// src/services/interfaceEngine/IInterfaceEngineService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the JSON/REST interface specification
// (see PathScribe_Interface_Specification_v1.1.docx, §7): the actual real
// trigger for a Category E OrderCreated event — not just the documented
// payload shape, the real code that constructs and dispatches one.
//
// Real, honest limitation, matching the spec's own Appendix B item 6:
// "PathScribe has no real backend today — everything is frontend,
// mock-service-backed." There is no real /api/v1/... endpoint this can
// actually POST to yet — that's real, separate backend infrastructure work.
// mockInterfaceEngineService.ts simulates the dispatch (records what would
// have been sent, for real inspection/testing) rather than pretending an
// HTTP call happened. When the real backend exists, only this file's own
// real implementation swaps — every real call site (AccessionPage.tsx)
// stays the same, same interface/mock/real pattern already established
// throughout this app's other services.
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

export interface IInterfaceEngineService {
  /**
   * Dispatches a real Category E OrderCreated event. Real, honest
   * "delivered" semantics: true only means the mock recorded it — see
   * this file's own header comment for why there's genuinely no real
   * transport yet.
   */
  postOrderCreated(payload: OrderCreationEventPayload): Promise<ServiceResult<{ delivered: boolean }>>;

  /** Real, dedicated inspection method — for tests and for a future real
   *  admin UI showing "what would have gone out." Returns every event
   *  dispatched so far, most-recent-first. */
  listDispatchedEvents(organisationId: string): Promise<ServiceResult<OrderCreationEventPayload[]>>;
}

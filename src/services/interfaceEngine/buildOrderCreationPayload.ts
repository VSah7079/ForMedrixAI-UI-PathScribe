// src/services/interfaceEngine/buildOrderCreationPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: the actual trigger for a Category E
// OrderCreated event (PathScribe_Interface_Specification_v1.1.docx, §7) —
// this is the pure mapping half; AccessionPage.tsx's own real call site
// decides WHEN to call it (only for a genuine "scratch" case — no matching
// pre-existing order, see that file's own comment at the real call site).
//
// Deliberately a pure function, not reaching into any service itself —
// same "pure, testable, real-data-in real-data-out" posture as this app's
// other payload/parsing utilities this session (isoDateForSearch,
// parseScannedPayload). The real MPI resolution outcome is a required
// parameter, not re-derived here, since the caller already has it from the
// same resolveOrCreatePatient() call that created the Case's own patient.id.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { OrderCreationEventPayload, OrderCreationPatient } from './IInterfaceEngineService';

export type MpiResolutionOutcome = 'matched' | 'created' | 'ambiguous';

/** Real mapping from the MPI resolution outcome already computed at case
 *  creation to the spec's own §2.6 patientDataScope. 'ambiguous' maps to
 *  'full' — the safer of the two mistakes (see the formal spec's own
 *  reasoning: a downstream system unable to establish the case at all is a
 *  bigger real problem than sending demographics it turns out not to
 *  need). */
export function patientDataScopeFor(outcome: MpiResolutionOutcome): 'reference' | 'full' {
  return outcome === 'matched' ? 'reference' : 'full';
}

/** Real, stable, deterministic messageId — see the spec's own §2.3: stable
 *  across retries of the same real event. Case.id is already a real,
 *  unique, stable identifier for exactly one real accession — reusing it
 *  rather than generating a second, independent random id for the same
 *  real event. */
function buildMessageId(caseData: Case): string {
  return `evt-order-${caseData.id}`;
}

export function buildOrderCreationPayload(
  caseData: Case,
  mpiOutcome: MpiResolutionOutcome,
  eventTimestamp: string,
): OrderCreationEventPayload {
  const patient: OrderCreationPatient = {
    patientDataScope: patientDataScopeFor(mpiOutcome),
    identifier: caseData.patient.mrn,
  };
  if (patient.patientDataScope === 'full') {
    patient.firstName = caseData.patient.givenNames;
    patient.lastName = caseData.patient.familyNames;
    patient.dateOfBirth = caseData.patient.dateOfBirth;
    patient.sex = caseData.patient.sex === 'M' || caseData.patient.sex === 'F' ? caseData.patient.sex : 'U';
  }

  return {
    messageId: buildMessageId(caseData),
    eventType: 'OrderCreated',
    eventTimestamp,
    organisationId: caseData.originEnterpriseId,
    facilityId: caseData.originHospitalId,
    patient,
    order: {
      placerOrderNumber: caseData.accession.fullAccession,
      // Real fix, found while implementing this against the actual
      // codebase: the formal spec's own first draft said 'ASAP', copied
      // from the original ORM^O01 draft without cross-checking this
      // app's real Priority type (types/case/Case.ts) — the real value
      // is 'Rush', not 'ASAP'. Fixed here and in the spec document
      // itself.
      priority: caseData.order.priority,
      orderingProvider: caseData.order.requestingProvider
        ? { rawName: caseData.order.requestingProvider }
        : undefined,
      clinicalIndication: caseData.order.clinicalIndication,
    },
    diagnoses: caseData.order.icd10Codes?.map((dx, i) => ({
      code: dx.code,
      description: dx.description,
      isPrincipal: i === 0, // same real "first is principal" convention as dftBuilder.ts's own DG1 stack
    })),
    specimens: caseData.specimens.map(sp => ({
      label: sp.label,
      bodySite: sp.collection?.bodySite,
      collectionMethod: sp.collection?.method,
      collectionDateTime: sp.collection?.collectedAt,
      fixative: sp.processing?.fixative,
      grossDescriptionNote: sp.description,
    })),
  };
}

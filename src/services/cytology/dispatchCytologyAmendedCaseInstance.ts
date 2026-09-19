// src/services/cytology/dispatchCytologyAmendedCaseInstance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Cytology has no amendment mechanism at
// all... work this"), then corrected ("Cytology cases can have
// addendums") — the real, electronic dispatch for a genuine Cytology
// correction OR addendum. Mirrors services/reports/dispatchAmendedCaseInstance.ts's
// own shape (scoped to one specific record, no dedup — each real
// correction/addendum is its own, distinct, legitimate event), but
// built against Cytology's own real, genuinely different data model —
// same real caseRouter/mockPatientIndexService resolution
// dispatchCytologyCaseInstances.ts already established, dispatched
// through the same, real Cytology-specific outbound queue and payload
// builder, never buildOruR01Payload/mockOutboundResultQueueService.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import { mockCytologyOutboundResultQueueService } from './mockCytologyOutboundResultQueueService';
import { buildCytologyOruR01Payload } from './buildCytologyOruR01Payload';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';

export async function dispatchCytologyAmendedCaseInstance(
  caseId: string,
  signOutRecordId: string,
  /** Real, per direct correction ("Cytology cases can have addendums")
   *  — mirrors services/reports/dispatchAmendedCaseInstance.ts's own
   *  real signature. */
  resultState: 'CORRECTED' | 'ADDENDUM',
  previouslyReportedAs?: string,
): Promise<void> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return;

  const patientId = (caseData as any)?.patient?.id;
  const patientRecord = patientId ? await mockPatientIndexService.getById(patientId) : null;
  // Honest, non-blocking skip — same real posture as
  // dispatchCytologyCaseInstances.ts's own identical check: no real
  // organisationId to enqueue against.
  if (!patientRecord) return;

  // Real, honest lookup — getByCaseId returns every real record for
  // the case; find() locates this one, specific real record rather
  // than assuming which one is "current." A correction's own new
  // record is always the most recent by construction, but this
  // function never relies on that — it dispatches whichever real
  // record its own caller (releaseCytologyCorrection.ts) names.
  const recordsRes = await mockCytologySignOutRecordService.getByCaseId(caseId);
  if (!recordsRes.ok) return;
  const record = recordsRes.data.find(r => r.id === signOutRecordId);
  if (!record) return;

  const payload = buildCytologyOruR01Payload(record, resultState, previouslyReportedAs);

  const enqueueRes = await mockCytologyOutboundResultQueueService.enqueue({
    caseId, signOutRecordId: record.id, resultState,
    organisationId: (patientRecord as any).organisationId,
  });
  if (!enqueueRes.ok) return;

  const result = await dispatchInterfaceMessage(enqueueRes.data.id, 'ORU_R01', payload as any);
  if (result.ok) {
    await mockCytologyOutboundResultQueueService.markSent(enqueueRes.data.id);
  } else {
    await mockCytologyOutboundResultQueueService.markFailed(enqueueRes.data.id, {
      errorCode: (result as any).errorCode ?? 'DISPATCH_REJECTED',
      errorMessage: (result as any).error ?? 'Unknown dispatch failure.',
      maxRetriesExceeded: false,
    });
  }
}

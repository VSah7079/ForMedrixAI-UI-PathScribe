// src/services/reports/dispatchAmendedCaseInstance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("wire that in" — replacing
// sendSynopticReportToLis entirely for orchestration-mode amendments):
// the real, electronic dispatch for a genuine CORRECTED or ADDENDUM
// result. Reuses buildOruR01Payload.ts's own, already-tested builder
// and mockOutboundResultQueueService.ts's own, already-tested queue —
// same real infrastructure dispatchCaseInstances.ts and
// dispatchPreliminaryCaseInstances.ts already use, never a third,
// separate implementation of the same enqueue → dispatch →
// markSent/markFailed sequence.
//
// Real, deliberate difference from dispatchCaseInstances.ts (which is
// genuinely, permanently 'FINAL'-only — confirmed directly: it hardcodes
// 'FINAL' in its own dedup check, payload build, and enqueue call, all
// three): this function is scoped to ONE, specific real instance —
// the one actually amended — never every SynopticReportInstance on the
// case. A correction to one specimen's result has nothing to do with
// every other, unrelated specimen also on that case; re-dispatching
// all of them would misrepresent which result actually changed.
//
// Real, deliberate: no dedup at all, same real reasoning as
// dispatchPreliminaryCaseInstances.ts's own identical choice — each
// genuine correction or addendum is its own, distinct, legitimate real
// event (a case can be corrected more than once over its lifetime),
// never a re-send of something already sent.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockOutboundResultQueueService } from './mockOutboundResultQueueService';
import { buildOruR01Payload } from './buildOruR01Payload';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';

export async function dispatchAmendedCaseInstance(
  caseId: string,
  instanceId: string,
  resultState: 'CORRECTED' | 'ADDENDUM',
  /** Real, per direct correction — the real, prior instance.comment,
   *  verbatim, forwarded straight through to buildOruR01Payload.ts's
   *  own identical parameter. See that function's own doc comment for
   *  the full reasoning; this function never fetches or constructs
   *  it itself either. */
  previouslyReportedAs?: string,
): Promise<void> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return;

  const patientId = (caseData as any)?.patient?.id;
  const patient = patientId ? await mockPatientIndexService.getById(patientId) : null;
  // Honest, non-blocking skip — same real posture as
  // dispatchCaseInstances.ts's own identical check: no real
  // organisationId to enqueue against.
  if (!patient) return;

  const payload = await buildOruR01Payload(caseId, instanceId, resultState, undefined, undefined, previouslyReportedAs);
  // Real, honest skip — buildOruR01Payload() itself returns null for a
  // genuinely nonexistent instance or a non-orchestrator case; never a
  // fabricated payload.
  if (!payload) return;

  const enqueueRes = await mockOutboundResultQueueService.enqueue({
    caseId, instanceId, resultState,
    organisationId: patient.organisationId,
  });
  if (!enqueueRes.ok) return;

  const result = await dispatchInterfaceMessage(enqueueRes.data.id, 'ORU_R01', payload);
  if (result.ok) {
    await mockOutboundResultQueueService.markSent(enqueueRes.data.id);
  } else {
    await mockOutboundResultQueueService.markFailed(enqueueRes.data.id, {
      errorCode: result.errorCode ?? 'DISPATCH_REJECTED',
      errorMessage: result.error ?? 'Unknown dispatch failure.',
      maxRetriesExceeded: false,
    });
  }
}

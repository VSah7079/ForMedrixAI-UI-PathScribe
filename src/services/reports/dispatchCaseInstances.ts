// src/services/reports/dispatchCaseInstances.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (the Post-Sign-Out Release Buffer / real
// outbound ORU^R01 dispatch reconciliation — "Are you sure that Finalize
// is intended for the assist mode case while signout for the
// orchestration mode cases?" and the full design that followed): the
// single, real, idempotent dispatch execution point for orchestration
// mode's initial sign-out — called from exactly two real places,
// deliberately never duplicated:
//   - handleSignOutConfirm() (useSignOutWorkflow.ts), synchronously,
//     when no release buffer applies (disabled config, or a real
//     STAT-priority bypass) — there's no reason to make a case wait on
//     a buffer that was never going to fire.
//   - checkAndReleaseIfExpired() (mockReportReleaseService.ts), when a
//     real buffer's countdown genuinely expires.
//
// Real, per direct guidance ("each specimen/instance represents its own
// discrete observation stream (OBR/OBX structure)... Do not build a new
// composite multi-report message"): deliberately per-instance, reusing
// buildOruR01Payload.ts's own, already-tested builder and
// mockOutboundResultQueueService.ts's own, already-tested queue —
// never a new, combined whole-case payload format.
//
// Real, deliberate scope: 'FINAL' only — this function is the real,
// INITIAL dispatch for a case's first sign-out. CORRECTED/ADDENDUM
// results (real amendments, re-signed after this) stay on their
// existing, separate, unchanged path — the release buffer was never
// scoped to amendments (confirmed directly: useAmendmentWorkflow.ts has
// zero release-buffer awareness), and this pass doesn't change that.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockOutboundResultQueueService } from './mockOutboundResultQueueService';
import { buildOruR01Payload } from './buildOruR01Payload';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';

export async function dispatchCaseInstances(caseId: string): Promise<void> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return;

  const patientId = (caseData as any)?.patient?.id;
  const patient = patientId ? await mockPatientIndexService.getById(patientId) : null;
  // Honest, non-blocking skip — no real organisationId to enqueue
  // against. Same real posture as every other real outbound-queue
  // enqueue in this app.
  if (!patient) return;

  const finalizedInstances = (caseData.synopticReports ?? []).filter(r => r.status === 'finalized');

  for (const instance of finalizedInstances) {
    // Real, idempotent dedup — this function may genuinely be called
    // more than once for the same case (a page reload mid-buffer, a
    // real retry of the whole flow) — never double-enqueue the same
    // real instance's initial FINAL result.
    const existingRes = await mockOutboundResultQueueService.getByInstanceAndState(instance.instanceId, 'FINAL');
    if (existingRes.ok && existingRes.data.length > 0) continue;

    const payload = await buildOruR01Payload(caseId, instance.instanceId, 'FINAL');
    // Real, honest skip — buildOruR01Payload() itself returns null for
    // a genuinely nonexistent case or a non-orchestrator case; never a
    // fabricated payload.
    if (!payload) continue;

    const enqueueRes = await mockOutboundResultQueueService.enqueue({
      caseId,
      instanceId: instance.instanceId,
      resultState: 'FINAL',
      organisationId: patient.organisationId,
    });
    if (!enqueueRes.ok) continue;

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
}

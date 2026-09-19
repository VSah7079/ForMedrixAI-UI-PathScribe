// src/services/cytology/dispatchCytologyCaseInstances.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("wire in Cytology") — extracted directly
// from CytologyScreeningPage.tsx's own original, inline ORU^R01
// dispatch block, unchanged in behavior, so it can be shared through
// publishReportReleasedEvent.ts (services/reports/) rather than
// living only inline in one page's own handler.
//
// Real, honest structural reason this is its own, separate function
// rather than a branch inside dispatchCaseInstances.ts: Cytology has
// no SynopticReportInstance at all — its own real sign-out unit is
// CytologySignOutRecord (mockCytologySignOutRecordService), dispatched
// through its own, already-real, separate outbound queue
// (mockCytologyOutboundResultQueueService) and payload builder
// (buildCytologyOruR01Payload) — confirmed directly before writing
// this, not assumed. These were real, working, already-tested
// implementations before this file existed; this file calls them,
// never re-implements them.
//
// Real, honest scope limit, per direct investigation: Cytology has no
// real PDF-generation mechanism at all today (confirmed directly —
// zero references to pdfBase64/generateReportPdf anywhere in
// CytologyScreeningPage.tsx). This function's own real job is the
// electronic (ORU^R01) dispatch only — it says nothing about print;
// a Cytology case reaching dispatchPrintJob.ts (Component B) via the
// same publishReportReleasedEvent call will honestly fail that
// specific job (PRINT_REJECTED, no generatePdf available) rather than
// silently print nothing, exactly the same real posture the release-
// buffer's own automatic-expiry path already has for the same reason.
//
// Real, deliberate scope: the separate CSMS/national-registry dispatch
// (REGISTRY_REPORT, mockCytologyRegistryOutboundQueueService) stays
// OUT of this function and out of publishReportReleasedEvent
// entirely — that's a real, distinct regulatory-reporting obligation
// to a national registry, not a "deliver this report to the ordering
// provider" concern the Report_Released_Event was ever scoped to
// cover. CytologyScreeningPage.tsx keeps that dispatch as its own,
// separate, unchanged call, alongside its new call into this event.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { mockPatientIndexService } from '../patients/mockPatientIndexService';
import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import { mockCytologyOutboundResultQueueService } from './mockCytologyOutboundResultQueueService';
import { buildCytologyOruR01Payload } from './buildCytologyOruR01Payload';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';

export async function dispatchCytologyCaseInstances(caseId: string): Promise<void> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return;

  const patientId = (caseData as any)?.patient?.id;
  const patientRecord = patientId ? await mockPatientIndexService.getById(patientId) : null;
  // Honest, non-blocking skip — same real posture as
  // dispatchCaseInstances.ts's own identical check: no real
  // organisationId to enqueue against.
  if (!patientRecord) return;

  const recordsRes = await mockCytologySignOutRecordService.getByCaseId(caseId);
  if (!recordsRes.ok) return;

  for (const record of recordsRes.data) {
    // Real, idempotent dedup — same real reasoning
    // dispatchCaseInstances.ts's own FINAL path already establishes:
    // this function may genuinely be called more than once for the
    // same case, never double-enqueue the same real record's initial
    // FINAL result. getBySignOutRecordId itself returns every real
    // entry regardless of state — filtered here for FINAL specifically,
    // matching dispatchCaseInstances.ts's own getByInstanceAndState
    // equivalent semantics on the one real method this service
    // actually has.
    const existingRes = await mockCytologyOutboundResultQueueService.getBySignOutRecordId(record.id).catch(() => null);
    if (existingRes?.ok && existingRes.data.some(e => e.resultState === 'FINAL')) continue;

    const enqueueRes = await mockCytologyOutboundResultQueueService.enqueue({
      caseId, signOutRecordId: record.id, resultState: 'FINAL',
      organisationId: (patientRecord as any).organisationId,
    });
    if (!enqueueRes.ok) continue;

    const payload = buildCytologyOruR01Payload(record);
    const dispatchResult = await dispatchInterfaceMessage(enqueueRes.data.id, 'ORU_R01', payload as any);
    if (dispatchResult.ok) {
      await mockCytologyOutboundResultQueueService.markSent(enqueueRes.data.id);
    } else {
      await mockCytologyOutboundResultQueueService.markFailed(enqueueRes.data.id, {
        errorCode: (dispatchResult as any).errorCode ?? 'DISPATCH_REJECTED',
        errorMessage: (dispatchResult as any).error ?? 'Unknown dispatch failure.',
        maxRetriesExceeded: false,
      });
    }
  }
}

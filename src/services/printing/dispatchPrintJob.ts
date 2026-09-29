// src/services/printing/dispatchPrintJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct spec ("Decoupled Dispatch & Print Management
// System", Component B) — the real dispatch function connecting the
// print queue (mockPrintQueueService.ts) to one of the three real,
// buildable delivery modes (NATIVE_QZ_TRAY / DIRECT_NETWORK_PRINT /
// INTERFACE_ENGINE_HANDOFF). The actual per-mode delivery attempt
// itself now lives in attemptPrintDelivery.ts — extracted for PS-279
// so redispatchPrintJob.ts's own real Retry/Redirect orchestration can
// reuse it without duplicating this branching a second time. This
// file's own remaining job is everything that's genuinely FIRST-
// dispatch-only: resolving the facility's config, resolving the real
// routing context and (for Mode 3) the real destination, resolving
// presentation options, and enqueuing the job record itself.
//
// Real, honest structural note, per direct investigation: the actual
// PDF bytes come from SynopticReportPage.tsx's own
// generateReportPdfSnapshot — a React useCallback, not callable from
// this or any other background/service-layer function. Same real
// limitation buildOruR01Payload.ts's own generatePdf parameter already
// documents and works around — this function accepts the identical,
// optional callback shape rather than inventing a second PDF-
// generation path. A caller with no real access to that closure (a
// future automatic event-hook trigger, for instance) genuinely cannot
// supply one yet; this function fails that job honestly
// (errorCode: 'PRINT_REJECTED') rather than queuing a job with no real
// PDF to ever print.
//
// Real, per the source spec's own Use Case 2 ("If the IP printer is
// offline, the LIS Print Spooler holds the job, alerts the LIS
// administrator, and re-attempts delivery without blocking the
// electronic HL7 interface"): a real Mode 1/Mode 2/Mode 3 failure
// marks the job FAILED via the real queue (visible for manual retry,
// same real UI pattern as OutboundInterfaceDlqSection.tsx), never
// thrown back to this function's own caller — a failed print must
// never block or mask the real, separate electronic dispatch this
// always runs alongside.
//
// Real, per PS-278 ("Print Destination Routing Engine") — Mode 3
// (DIRECT_NETWORK_PRINT) resolves a real printer via
// services/printRouting/resolvePrintDestination.ts's own four-tier
// hierarchy first (workstation → location → clientAccount →
// facility), falling back to this facility's own
// printDeliveryConfig.directNetworkPrintDestination only when no real
// PrintRoutingRule matched at any tier — never the other way around,
// since a facility-wide default must never shadow a real, more
// specific admin override.
//
// Real, per PS-279 — the real routing-context resolution
// (resolveRealPrintRoutingContext) now runs UNCONDITIONALLY for every
// mode, not only under DIRECT_NETWORK_PRINT as PS-278 originally had
// it: orderingFacilityId/pointOfCare are needed on every real PrintJob
// record regardless of delivery mode, since
// aggregatePrintJobsForBatch.ts's own §2.2.2 batch grouping and
// resolvePrintPresentationOptions.ts's own §2.2.4 client-preference
// lookup both key off them for every job this app ever queues, not
// just Direct Network Print ones. This is a real, deliberate widening
// of the same one real resolver PS-278 already built — never a
// second, parallel resolution path.
// ─────────────────────────────────────────────────────────────────────────────

import { facilityService } from '../index';
import { mockPrintQueueService } from './mockPrintQueueService';
import { mockPrintRoutingRuleService } from '../printRouting/mockPrintRoutingRuleService';
import { resolvePrintDestination } from '../printRouting/resolvePrintDestination';
import { resolveRealPrintRoutingContext, type RealPrintRoutingContextOverrides } from '../printRouting/resolveRealPrintRoutingContext';
import { resolvePrintPresentationOptions } from './resolvePrintPresentationOptions';
import { attemptPrintDelivery } from './attemptPrintDelivery';
import type { PrintJobReportType } from '@/types/printing/PrintJob';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

export interface DispatchPrintJobResult {
  /** Real, honest tri-state: 'not_configured' (this facility never
   *  opted into printing at all — a real, deliberate no-op, not a
   *  failure), 'dispatched' (a real job was queued and a real attempt
   *  made), 'failed' (a real job was queued but the real attempt
   *  itself failed — see the real, persisted PrintJob for detail). */
  outcome: 'not_configured' | 'dispatched' | 'failed';
  jobId?: string;
}

export async function dispatchPrintJob(
  caseId: string,
  performingFacilityId: string | undefined,
  reportType: PrintJobReportType,
  priority: 'Routine' | 'Urgent',
  generatePdf?: () => Promise<{ pdfBase64?: string; generationError?: string }>,
  /** Real, per PS-278 — optional and additive; `source` carries the
   *  same real 'SURGPATH' | 'CYTOLOGY' signal ReportReleasedEvent.source
   *  already does, forwarded through by publishReportReleasedEvent.ts
   *  — see resolveRealPrintRoutingContext.ts's own header for exactly
   *  how much of §2.1.1's own Specimen/Case Type criterion this
   *  reliably resolves. workstationId/userId/specimenCaseTypeOverride
   *  exist for a real, future interactive caller (e.g. a manual
   *  reprint action) that genuinely knows them — the automated
   *  release path never has real values for these today. */
  printRoutingContext?: { source?: 'SURGPATH' | 'CYTOLOGY' } & RealPrintRoutingContextOverrides,
): Promise<DispatchPrintJobResult> {
  if (!performingFacilityId) return { outcome: 'not_configured' };

  const facilityRes = await facilityService.getById(performingFacilityId);
  const config = facilityRes.ok ? facilityRes.data.printDeliveryConfig : undefined;
  if (!config || !config.enabled) return { outcome: 'not_configured' };

  // Real, per PS-279's own header note above — resolved for every
  // mode now, not only DIRECT_NETWORK_PRINT.
  const routingInput = await resolveRealPrintRoutingContext(
    caseId, reportType, performingFacilityId, printRoutingContext?.source, printRoutingContext,
  );

  // Real, per PS-279 §2.2.4 — the ORDERING facility's own preference
  // (a genuinely different real Facility record than the PERFORMING
  // one `config` above came from — see Facility.printPresentationPreference's
  // own doc comment for why). No real orderingFacilityId resolved at
  // all (e.g. no real Case.order.facilityId) falls back to the report
  // type's own default with no client override, same as any other
  // real, missing-preference case.
  let clientPreference: { paperSource?: import('@/types/printing/PrintJob').PaperSourceTray; duplexMode?: import('@/types/printing/PrintJob').DuplexMode } | undefined;
  if (routingInput.orderingFacilityId) {
    const orderingFacilityRes = await facilityService.getById(routingInput.orderingFacilityId);
    clientPreference = orderingFacilityRes.ok ? orderingFacilityRes.data.printPresentationPreference : undefined;
  }
  const presentation = resolvePrintPresentationOptions(reportType, clientPreference);

  // Real, per PS-278 §2.1.2 — resolved BEFORE enqueue now (a real
  // reordering, not a behavior change): a facility-wide default must
  // never shadow a real, more specific admin override, so the real
  // four-tier hierarchy is always tried first; only DIRECT_NETWORK_PRINT
  // jobs ever resolve or carry a destination at all.
  let destination: PrintDestination | undefined;
  if (config.mode === 'DIRECT_NETWORK_PRINT') {
    const rulesRes = await mockPrintRoutingRuleService.getActive();
    const rules = rulesRes.ok ? rulesRes.data : [];
    const resolution = resolvePrintDestination(rules, routingInput);
    destination = resolution.destination ?? config.directNetworkPrintDestination;
  }

  const enqueueRes = await mockPrintQueueService.enqueue({
    caseId,
    reportType,
    mode: config.mode,
    printerName: config.printerName,
    paperSize: config.paperSize,
    priority,
    source: printRoutingContext?.source,
    orderingFacilityId: routingInput.orderingFacilityId,
    pointOfCare: routingInput.pointOfCare,
    paperSource: presentation.paperSource,
    duplexMode: presentation.duplexMode,
    resolvedDestination: config.mode === 'DIRECT_NETWORK_PRINT' ? destination : undefined,
  });
  if (!enqueueRes.ok) return { outcome: 'failed' };
  const job = enqueueRes.data;

  if (config.mode === 'DIRECT_NETWORK_PRINT' && !destination) {
    await mockPrintQueueService.markFailed(job.id, {
      errorCode: 'PRINT_REJECTED',
      errorMessage: 'No PrintRoutingRule matched this job at any real tier, and this facility has no configured directNetworkPrintDestination default.',
      maxRetriesExceeded: true,
    });
    return { outcome: 'failed', jobId: job.id };
  }

  if (!generatePdf) {
    await mockPrintQueueService.markFailed(job.id, {
      errorCode: 'PRINT_REJECTED',
      errorMessage: 'No PDF generation available from this caller — the real report rendering closure only exists inside SynopticReportPage.tsx.',
      maxRetriesExceeded: true,
    });
    return { outcome: 'failed', jobId: job.id };
  }

  const pdfResult = await generatePdf();
  if (!pdfResult.pdfBase64) {
    await mockPrintQueueService.markFailed(job.id, {
      errorCode: 'PRINT_REJECTED',
      errorMessage: pdfResult.generationError ?? 'PDF generation returned no data.',
      maxRetriesExceeded: false,
    });
    return { outcome: 'failed', jobId: job.id };
  }

  // Real, per PS-279 — persist the real, rendered bytes onto the job
  // record itself now, right after the one real moment they're ever
  // in memory, so a later Retry/Redirect (redispatchPrintJob.ts) can
  // genuinely resend without needing to re-render — see PrintJob.pdfBase64's
  // own doc comment for the full, honest account.
  await mockPrintQueueService.persistRenderedPdf(job.id, pdfResult.pdfBase64);

  return attemptPrintDelivery({
    jobId: job.id,
    caseId,
    reportType,
    priority,
    mode: config.mode,
    pdfBase64: pdfResult.pdfBase64,
    printerName: config.printerName,
    paperSize: config.paperSize,
    destination,
    presentation,
  });
}

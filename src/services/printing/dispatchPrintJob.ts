// src/services/printing/dispatchPrintJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct spec ("Decoupled Dispatch & Print Management
// System", Component B) — the real dispatch function connecting the
// print queue (mockPrintQueueService.ts) to one of the two real,
// buildable delivery modes: Mode 1 (Native LIS Spooler, via the same,
// already-integrated QZ Tray bridge this app already uses for
// cassette/slide labels) or Mode 2 (Interface Engine Hand-off, via
// dispatchInterfaceMessage.ts's own, already-generic dispatch).
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
// electronic HL7 interface"): a real Mode 1/Mode 2 failure marks the
// job FAILED via the real queue (visible for manual retry, same real
// UI pattern as OutboundInterfaceDlqSection.tsx), never thrown back to
// this function's own caller — a failed print must never block or
// mask the real, separate electronic dispatch this always runs
// alongside.
// ─────────────────────────────────────────────────────────────────────────────

import { facilityService } from '../index';
import { mockPrintQueueService } from './mockPrintQueueService';
import { printPdfViaQzTray, isQzTrayConnected } from '@/utils/labels/qzTrayBridge';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import type { PrintJobReportType } from '@/types/printing/PrintJob';

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
): Promise<DispatchPrintJobResult> {
  if (!performingFacilityId) return { outcome: 'not_configured' };

  const facilityRes = await facilityService.getById(performingFacilityId);
  const config = facilityRes.ok ? facilityRes.data.printDeliveryConfig : undefined;
  if (!config || !config.enabled) return { outcome: 'not_configured' };

  const enqueueRes = await mockPrintQueueService.enqueue({
    caseId,
    reportType,
    mode: config.mode,
    printerName: config.printerName,
    paperSize: config.paperSize,
    priority,
  });
  if (!enqueueRes.ok) return { outcome: 'failed' };
  const job = enqueueRes.data;

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

  if (config.mode === 'NATIVE_QZ_TRAY') {
    if (!config.printerName) {
      await mockPrintQueueService.markFailed(job.id, {
        errorCode: 'PRINT_REJECTED', errorMessage: 'No printer configured for Native QZ Tray delivery.', maxRetriesExceeded: true,
      });
      return { outcome: 'failed', jobId: job.id };
    }
    if (!isQzTrayConnected()) {
      // Real, per the source spec's own Use Case 2 — an unreachable
      // real printer/bridge holds the job for real, manual retry
      // rather than blocking or throwing.
      await mockPrintQueueService.markFailed(job.id, {
        errorCode: 'PRINTER_OFFLINE', errorMessage: 'QZ Tray is not connected.', maxRetriesExceeded: false,
      });
      return { outcome: 'failed', jobId: job.id };
    }
    const printRes = await printPdfViaQzTray(config.printerName, pdfResult.pdfBase64, 1, config.paperSize);
    if (!printRes.ok) {
      // Real, deliberate cast — this project's own tsconfig.json has
      // strictNullChecks disabled, under which TypeScript cannot
      // reliably narrow a discriminated union to its `ok: false`
      // branch. Same real, established workaround dispatchZplLabel.ts's
      // own identical situation already uses.
      await mockPrintQueueService.markFailed(job.id, {
        errorCode: 'PRINTER_UNREACHABLE', errorMessage: (printRes as { ok: false; message: string }).message, maxRetriesExceeded: false,
      });
      return { outcome: 'failed', jobId: job.id };
    }
    await mockPrintQueueService.markPrinted(job.id);
    return { outcome: 'dispatched', jobId: job.id };
  }

  // Mode 2 — Interface Engine Hand-off. Real, per the source spec's
  // own Use Case 1: hands the rendered PDF off; the Interface Engine
  // owns real printer-spooling middleware from there, never PathScribe.
  const dispatchRes = await dispatchInterfaceMessage(job.id, 'PRINT_JOB', {
    caseId, reportType, priority, pdfBase64: pdfResult.pdfBase64, paperSize: config.paperSize,
  });
  if (!dispatchRes.ok) {
    await mockPrintQueueService.markFailed(job.id, {
      errorCode: 'PRINTER_UNREACHABLE', errorMessage: (dispatchRes as any).error ?? 'Interface Engine hand-off failed.', maxRetriesExceeded: false,
    });
    return { outcome: 'failed', jobId: job.id };
  }
  await mockPrintQueueService.markPrinted(job.id);
  return { outcome: 'dispatched', jobId: job.id };
}

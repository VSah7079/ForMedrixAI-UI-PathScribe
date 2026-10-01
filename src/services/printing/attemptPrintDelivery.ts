// src/services/printing/attemptPrintDelivery.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 — extracted directly out of dispatchPrintJob.ts's own
// three mode branches (NATIVE_QZ_TRAY / DIRECT_NETWORK_PRINT /
// INTERFACE_ENGINE_HANDOFF), unchanged in behavior, so a second real
// caller (redispatchPrintJob.ts, PS-279 §2.2.3's own Retry/Redirect)
// can genuinely re-attempt delivery of an already-queued job without
// duplicating this branching logic a second time. dispatchPrintJob.ts
// itself now calls this too, right after its own enqueue() +
// destination-resolution — resolution (which destination, which
// printer) stays there, since that's real, first-dispatch-only
// business logic (PrintRoutingRule resolution, facility config
// lookup); this file only ever ATTEMPTS delivery to an already-decided
// target and records the real queue-state transition
// (markPrinted/markFailed), same as the code it was extracted from.
//
// Real, per PS-279 §2.2.4 — `presentation` is passed straight through
// to dispatchViaPrintProtocol.ts for a DIRECT_NETWORK_PRINT job; see
// that file and sendIppPrintJob.ts's own header for the honest,
// per-protocol account of which of the three real wire protocols can
// actually carry it.
// ─────────────────────────────────────────────────────────────────────────────

import { mockPrintQueueService } from './mockPrintQueueService';
import { printPdfViaQzTray, isQzTrayConnected } from '@/utils/labels/qzTrayBridge';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';
import { dispatchViaPrintProtocol } from './transport/dispatchViaPrintProtocol';
import type { PrintDeliveryMode, PrintJobReportType, PaperSize, PaperSourceTray, DuplexMode } from '@/types/printing/PrintJob';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

export interface PrintDeliveryPresentation {
  paperSource?: PaperSourceTray;
  duplexMode?: DuplexMode;
}

export interface AttemptPrintDeliveryInput {
  jobId: string;
  caseId: string;
  reportType: PrintJobReportType;
  priority: 'Routine' | 'Urgent';
  mode: PrintDeliveryMode;
  pdfBase64: string;
  /** Only meaningful for NATIVE_QZ_TRAY. */
  printerName?: string;
  paperSize?: PaperSize;
  /** Only meaningful for DIRECT_NETWORK_PRINT — the already-decided
   *  real target (freshly resolved on first dispatch, or the job's
   *  own persisted resolvedDestination/redirectedToDestination on a
   *  real Retry/Redirect). */
  destination?: PrintDestination;
  /** Real, per PS-279 §2.2.4. */
  presentation?: PrintDeliveryPresentation;
}

export interface AttemptPrintDeliveryResult {
  outcome: 'dispatched' | 'failed';
  jobId: string;
}

export async function attemptPrintDelivery(input: AttemptPrintDeliveryInput): Promise<AttemptPrintDeliveryResult> {
  const { jobId, caseId, reportType, priority, mode, pdfBase64 } = input;

  if (mode === 'NATIVE_QZ_TRAY') {
    if (!input.printerName) {
      await mockPrintQueueService.markFailed(jobId, {
        errorCode: 'PRINT_REJECTED', errorMessage: 'No printer configured for Native QZ Tray delivery.', maxRetriesExceeded: true,
      });
      return { outcome: 'failed', jobId };
    }
    if (!isQzTrayConnected()) {
      // Real, per the source spec's own Use Case 2 — an unreachable
      // real printer/bridge holds the job for real, manual retry
      // rather than blocking or throwing.
      await mockPrintQueueService.markFailed(jobId, {
        errorCode: 'PRINTER_OFFLINE', errorMessage: 'QZ Tray is not connected.', maxRetriesExceeded: false,
      });
      return { outcome: 'failed', jobId };
    }
    // Real, per PS-278/279 gap-closing follow-up — presentation (paper
    // source/duplex) is now threaded to QZ Tray too, closing the real,
    // previously-disclosed gap where it was resolved for every job
    // (resolvePrintPresentationOptions.ts) but only ever read by the
    // DIRECT_NETWORK_PRINT branch below, never this one.
    const printRes = await printPdfViaQzTray(input.printerName, pdfBase64, 1, input.paperSize, input.presentation);
    if (!printRes.ok) {
      // Real, deliberate cast — this project's own tsconfig.json has
      // strictNullChecks disabled, under which TypeScript cannot
      // reliably narrow a discriminated union to its `ok: false`
      // branch. Same real, established workaround dispatchZplLabel.ts's
      // own identical situation already uses.
      await mockPrintQueueService.markFailed(jobId, {
        errorCode: 'PRINTER_UNREACHABLE', errorMessage: (printRes as { ok: false; message: string }).message, maxRetriesExceeded: false,
      });
      return { outcome: 'failed', jobId };
    }
    await mockPrintQueueService.markPrinted(jobId);
    return { outcome: 'dispatched', jobId };
  }

  if (mode === 'DIRECT_NETWORK_PRINT') {
    if (!input.destination) {
      await mockPrintQueueService.markFailed(jobId, {
        errorCode: 'PRINT_REJECTED',
        errorMessage: 'No real PrintDestination available for this Direct Network Print job.',
        maxRetriesExceeded: true,
      });
      return { outcome: 'failed', jobId };
    }
    const sendRes = await dispatchViaPrintProtocol(input.destination, Buffer.from(pdfBase64, 'base64'), input.presentation);
    if (!sendRes.ok) {
      await mockPrintQueueService.markFailed(jobId, {
        errorCode: 'PRINTER_UNREACHABLE', errorMessage: sendRes.error ?? 'Direct network print failed.', maxRetriesExceeded: false,
      });
      return { outcome: 'failed', jobId };
    }
    await mockPrintQueueService.markPrinted(jobId);
    return { outcome: 'dispatched', jobId };
  }

  // Mode 2 — Interface Engine Hand-off. Real, per the source spec's
  // own Use Case 1: hands the rendered PDF off; the Interface Engine
  // owns real printer-spooling middleware from there, never PathScribe.
  const dispatchRes = await dispatchInterfaceMessage(jobId, 'PRINT_JOB', {
    caseId, reportType, priority, pdfBase64, paperSize: input.paperSize,
  });
  if (!dispatchRes.ok) {
    await mockPrintQueueService.markFailed(jobId, {
      errorCode: 'PRINTER_UNREACHABLE', errorMessage: (dispatchRes as any).error ?? 'Interface Engine hand-off failed.', maxRetriesExceeded: false,
    });
    return { outcome: 'failed', jobId };
  }
  await mockPrintQueueService.markPrinted(jobId);
  return { outcome: 'dispatched', jobId };
}

// src/types/printing/PrintJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct spec ("Decoupled Dispatch & Print Management
// System", Component B — "Print Queue Engine... routing to local/
// network print spoolers"). Mirrors OutboundResultQueueEntry.ts's own,
// already-established real shape (queue/retry/error-code convention)
// — not a new pattern invented for print specifically.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per the source spec's own Section 2 (Component B):
 *  - 'NATIVE_QZ_TRAY': Mode 1 (Native LIS Spooler) — routes the
 *    rendered PDF directly to a printer via the same, real, already-
 *    integrated QZ Tray bridge this app already uses for cassette/
 *    slide labels (qzTrayBridge.ts), extended here with a real PDF
 *    print path alongside its existing raw-ZPL one.
 *  - 'INTERFACE_ENGINE_HANDOFF': Mode 2 — hands the rendered PDF off
 *    to the Interface Engine (dispatchInterfaceMessage.ts), which
 *    owns real printer-spooling middleware (LRS, CUPS, an enterprise
 *    print server) from there — PathScribe's own, already-established
 *    boundary: it dispatches, the Interface Engine spools. */
export type PrintDeliveryMode = 'NATIVE_QZ_TRAY' | 'INTERFACE_ENGINE_HANDOFF';

export type PrintJobReportType = 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'ADDENDUM';

/** Real, per direct follow-up ("we need to be able to define what
 *  kind of printer paper we are using... UK uses A4") — a facility-
 *  level choice (Facility.printDeliveryConfig.paperSize), not a
 *  per-job one: which paper a given site's printer is physically
 *  loaded with is a property of the printer/site, not of any one
 *  report. Real, standard dimensions in mm — chosen over inches to
 *  represent A4 exactly (210mm × 297mm) without the repeating-decimal
 *  rounding an inch-based representation would introduce. */
export type PaperSize = 'LETTER' | 'A4' | 'LEGAL';

export const PAPER_SIZE_DIMENSIONS_MM: Record<PaperSize, { width: number; height: number }> = {
  LETTER: { width: 215.9, height: 279.4 },
  A4:     { width: 210,   height: 297 },
  LEGAL:  { width: 215.9, height: 355.6 },
};

export interface PrintJob {
  /** Real UUID — same real reasoning as OutboundResultQueueEntry.id
   *  (a real, external identifier a downstream printer/interface
   *  engine can dedupe or acknowledge against). */
  id: string;
  caseId: string;
  reportType: PrintJobReportType;
  mode: PrintDeliveryMode;
  /** Real, only meaningful for NATIVE_QZ_TRAY — the specific,
   *  configured printer name QZ Tray resolves against. Absent for
   *  INTERFACE_ENGINE_HANDOFF, where the Interface Engine's own,
   *  separate configuration owns this decision, never PathScribe. */
  printerName?: string;
  /** Real, per the source spec's own Use Case 3 (Emergency/High-
   *  Priority Preliminary Notification — "Print Queue Engine bypasses
   *  batch processing and immediately sends PDF to the designated OR
   *  floor network printer"). Deliberately mirrors the same real
   *  'Routine' | 'STAT'-style priority concept already used elsewhere
   *  in this app (Case.order.priority), not a new vocabulary. */
  priority: 'Routine' | 'Urgent';
  /** Real, per the same follow-up — the real paper size this job was
   *  actually printed at, carried onto the job record for a real,
   *  honest audit trail (a UK facility's own jobs should show A4, not
   *  a silent, undocumented assumption). */
  paperSize?: PaperSize;
  status: 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED';
  queuedAt: string;
  /** Real, per the source spec's own Use Case 2 ("If the IP printer
   *  is offline, the LIS Print Spooler holds the job, alerts the LIS
   *  administrator, and re-attempts delivery without blocking the
   *  electronic HL7 interface") — same real distinction
   *  OutboundResultQueueEntry.errorCode already draws between a
   *  genuine timeout and a genuinely unreachable destination. */
  errorCode?: 'PRINTER_OFFLINE' | 'PRINTER_UNREACHABLE' | 'PRINT_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}

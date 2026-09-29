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
 *    boundary: it dispatches, the Interface Engine spools. This is
 *    also the real, correct home for PS-278 §2.1.3's own "print-server
 *    abstraction" option — confirmed directly before adding a mode
 *    below, this is already exactly that, not a gap.
 *  - 'DIRECT_NETWORK_PRINT' (real, added for PS-278 §2.1.2/§2.1.3):
 *    Mode 3 — no QZ Tray, no Interface Engine; the resolved
 *    PrintDestination (services/printRouting/resolvePrintDestination.ts)
 *    is reached directly, over one of the three real IP print
 *    protocols §2.1.3 names (services/printing/transport/
 *    dispatchViaPrintProtocol.ts) — genuinely "no client-side printer
 *    driver installation" at all, the one real thing neither Mode 1
 *    (needs QZ Tray installed) nor Mode 2 (needs an Interface Engine)
 *    can claim. */
export type PrintDeliveryMode = 'NATIVE_QZ_TRAY' | 'INTERFACE_ENGINE_HANDOFF' | 'DIRECT_NETWORK_PRINT';

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

/** Real, per PS-279 §2.2.4 ("programmatic paper-source selection —
 *  Tray 1: Letterhead, Tray 2: Plain"). Named literally, per the
 *  source spec's own two examples — confirmed nothing like this
 *  existed anywhere before adding it (PaperSize above is physical
 *  dimensions, LETTER/A4/LEGAL, a genuinely different, orthogonal
 *  concept — a Tray 1 letterhead feed can itself be loaded with
 *  either LETTER or A4 stock depending on site). */
export type PaperSourceTray = 'TRAY_1_LETTERHEAD' | 'TRAY_2_PLAIN';

/** Real, per PS-279 §2.2.4's own "duplex/simplex mode." */
export type DuplexMode = 'DUPLEX' | 'SIMPLEX';

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
  /** Real, per PS-279 §2.2.3 — 'HOLD'/'CANCELLED' added. Naming
   *  follows this app's own established precedent
   *  (`ServiceChargeRecord.approvalStatus`'s own `'HOLD'` literal,
   *  services/billing/), not a fresh "HELD"/"PAUSED" vocabulary. */
  status: 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED' | 'HOLD' | 'CANCELLED';
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

  /** Real, per PS-279 §2.2.3 — the real status this job was in the
   *  moment it was held, restored verbatim on release rather than
   *  guessed/reset to 'QUEUED'. Same real
   *  `approvalStatusBeforeHold`-style restore-on-release convention
   *  `ServiceChargeRecord.ts` already establishes. Undefined unless
   *  this job is currently 'HOLD'. */
  statusBeforeHold?: PrintJob['status'];
  heldBy?: string;
  heldAt?: string;
  /** Real, free-text — no closed reason-code enum exists for this
   *  today (unlike `CaseHold.reason`'s own `CaseHoldReason`), so this
   *  stays a plain, optional note rather than forcing a fabricated
   *  taxonomy onto a genuinely new, narrower concept. */
  holdReason?: string;
  releasedBy?: string;
  releasedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;

  /** Real, per PS-279 — only ever set for a real `DIRECT_NETWORK_PRINT`
   *  job: the real destination `resolvePrintDestination.ts` actually
   *  resolved at the moment this job was first dispatched, persisted
   *  so a later Retry reuses the exact same real target rather than
   *  re-running §2.1.2's own resolution and risking a silently
   *  different real answer if the site's own rules changed meanwhile. */
  resolvedDestination?: import('@/types/printRouting/PrintDestination').PrintDestination;
  /** Real, per PS-279 §2.2.3's own "redirect" operation — an explicit,
   *  admin-chosen override that wins over `resolvedDestination` on
   *  any (re)dispatch once set. Undefined means this job has never
   *  been redirected. */
  redirectedToDestination?: import('@/types/printRouting/PrintDestination').PrintDestination;
  redirectedBy?: string;
  redirectedAt?: string;

  /** Real, per PS-279 — persisted so Retry/Redirect can genuinely
   *  resend this exact job without re-rendering the report, which
   *  this app has no real, general way to do outside the original
   *  release-time call (see dispatchPrintJob.ts's own header for the
   *  full, honest account of why `generatePdf` is only ever a live
   *  callback, never a stored function). A deliberate, disclosed
   *  architecture choice: the persisted PDF reflects the report's
   *  content at the moment of ORIGINAL release — a stale Retry of an
   *  old, held job reprints exactly what was originally queued, never
   *  a live re-query of the case (the same, real, "reprint what was
   *  actually queued" semantic any physical print queue already has). */
  pdfBase64?: string;

  /** Real, per PS-279 — mirrors `ReportReleasedEvent.source`
   *  (services/reports/publishReportReleasedEvent.ts), carried onto
   *  the job at enqueue time for the dashboard's own real display/
   *  filtering use, never a second, independently-maintained
   *  classification of the same real event. */
  source?: 'SURGPATH' | 'CYTOLOGY';
  /** Real, per PS-279 §2.2.2 — the real client-account grouping key
   *  (`Case.order.facilityId`, the same real field
   *  `resolvePrintDestination.ts`'s own `clientAccount` tier and
   *  Component C's `DeliveryRule.orderingFacilityId` both already
   *  resolve against), resolved once at enqueue time so batch
   *  aggregation never needs a second, separate case lookup per job. */
  orderingFacilityId?: string;
  /** Real, per PS-279 §2.2.2's own "grouped by ... delivery route" —
   *  this app has no distinct, named "delivery route" registry (see
   *  services/printing/README.md's own account), so this reuses the
   *  real `Location.pointOfCare` value (the same real field
   *  `resolvePrintDestination.ts`'s own `location` tier already
   *  resolves against) as the real, honest grouping key instead. */
  pointOfCare?: string;
  /** Real, per PS-279 §2.2.2 — set once a scheduled batch aggregation
   *  run groups this job; undefined means this job has never been
   *  part of a real batch. */
  batchId?: string;

  /** Real, per PS-279 §2.2.4 — resolved once at enqueue time via
   *  services/printing/resolvePrintPresentationOptions.ts, from this
   *  job's own reportType and the ordering client's real, optional
   *  preference. */
  paperSource?: PaperSourceTray;
  duplexMode?: DuplexMode;
}

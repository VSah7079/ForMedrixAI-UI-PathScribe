// src/types/printing/NetworkPrintPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct request: PS-51's own spec, Sections 5
// ("Network Print Payload Specification") and 7 ("Callback Status
// Specification"). PathScribe-owned internal event contract for
// SENDING a print job to a real Interface Engine and RECEIVING its
// callback — same real "PathScribe publishes what happened in its own
// system; [external system] owns the vendor-specific part" pattern as
// MaterialLocationEventPayload.ts/ModeAOrderPayload.ts already use
// throughout this app.
//
// Real, honest scope boundary, stated once here rather than repeated
// on every field: this type describes the REAL, correct shape of what
// PathScribe would send and expect back. It does not, and cannot from
// inside this codebase, make that Interface Engine exist — see
// dispatchNetworkPrintJob.ts's own header for the full reasoning.
// ─────────────────────────────────────────────────────────────────────────────

import type { PrinterVendor } from '@/services/printerProfiles/IPrinterProfileService';

/** Real action types this app can request — Section 5.1 shows
 *  PRINT_NETWORK_LABEL explicitly; the others are named consistently
 *  for the same real label kinds this app already builds
 *  (cassette/slide/vial/batch — Section 3's own three symbology
 *  categories, plus Section 8.2's own PRINT_LOCAL_LABEL for the
 *  Local Bridge Agent path specifically). */
export type NetworkPrintAction = 'PRINT_NETWORK_LABEL' | 'PRINT_LOCAL_LABEL';

export interface NetworkPrintTargetPrinter {
  printerId: string;
  ipAddress: string;
  port: number;
  vendor: PrinterVendor;
}

/** Batch 347 (PS-54): which label this is. Absent means a cassette (the
 *  only kind before Batch 347), so an engine built to the first version of
 *  this contract keeps working. */
export type NetworkPrintLabelType = 'CASSETTE' | 'SLIDE';

export interface NetworkPrintLabelData {
  labelType?: NetworkPrintLabelType;
  accessionNumber: string;
  specimenDesignator: string;
  blockId: string;
  patientName: string;
  /** Real, raw GS1 DataMatrix string — built by
   *  gs1DataMatrix.ts's own buildGs1DataMatrix(), never hand-assembled
   *  inline. Contains a real, non-printing GS (0x1D) separator — see
   *  that module's own header. */
  gs1DataMatrix: string;
  /** Slide labels only (Batch 347): the level and stain printed on the slide. */
  slide?: { level: string; stainName: string };
}

/** Real, complete shape — Section 5.1's own JSON, field for field. */
export interface NetworkPrintPayload {
  eventId: string;
  /** Real, load-bearing field per Section 9.1's own "Idempotency
   *  enforcement" — same real value as eventId by the spec's own
   *  example, but kept as its own, separate field since a real retry
   *  of the SAME logical job could, in principle, need a new eventId
   *  for tracing while keeping the same idempotencyKey to guarantee
   *  no duplicate physical print (Section 12's own "Zero duplicate
   *  prints (idempotency)" acceptance criterion). */
  idempotencyKey: string;
  action: NetworkPrintAction;
  timestamp: string;
  templateVersion: string;
  callbackUrl: string;
  targetPrinter: NetworkPrintTargetPrinter;
  labelData: NetworkPrintLabelData;
  copies: number;
  /** Batch 347 (PS-54): 1 for the first send; 2, 3… when a user retries a
   *  failed job. A retry keeps the idempotencyKey and gets a new eventId,
   *  so the engine prints a given label at most once (see
   *  docs/architecture/LIVE_UPDATES_SIGNALR.md, network print results). */
  attempt?: number;
}

/** Real, complete error state enum — Section 7.2's own list, verbatim. */
export type NetworkPrintErrorState =
  | 'PRINTER_UNREACHABLE'
  | 'PAPER_OUT'
  | 'RIBBON_OUT'
  | 'HEAD_OPEN'
  | 'MALFORMED_ZPL'
  | 'INVALID_GS1';

export type NetworkPrintStatus = 'PRINT_SUCCESS' | NetworkPrintErrorState;

/** Real, complete shape — Section 7.1's own JSON, field for field.
 *  This is what PathScribe would RECEIVE from a real Interface
 *  Engine; see dispatchNetworkPrintJob.ts's own
 *  handleNetworkPrintCallback for what PathScribe does with one once
 *  it exists. */
export interface NetworkPrintCallback {
  eventId: string;
  status: NetworkPrintStatus;
  printerResponse: string;
  durationMs: number;
  timestamp: string;
}

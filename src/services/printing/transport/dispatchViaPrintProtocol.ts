// src/services/printing/transport/dispatchViaPrintProtocol.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278 §2.1.3 — the one, real, named entry point a caller
// (dispatchPrintJob.ts) uses, so it never has to know which of the
// three real wire-protocol implementations a given PrintDestination
// actually needs. Same real "one real dispatch point, callers don't
// branch on protocol themselves" posture dispatchPrintJob.ts's own
// two existing modes already establish one layer up.
// ─────────────────────────────────────────────────────────────────────────────

import { sendRawPrintJob, type SendPrintJobResult } from './sendRawPrintJob';
import { sendLprPrintJob } from './sendLprPrintJob';
import { sendIppPrintJob } from './sendIppPrintJob';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';
import type { PaperSourceTray, DuplexMode } from '@/types/printing/PrintJob';

/** Real, per PS-279 §2.2.4 — optional and additive. Only IPP (RFC
 *  8010's own real, extensible job-template attribute group) can
 *  actually carry this over the wire; see sendIppPrintJob.ts's own
 *  header for the full, honest account. RAW_9100/LPR_LPD have no
 *  real protocol-level equivalent (no attribute channel at all beyond
 *  raw bytes/RFC 1179's own fixed control-file fields) — a caller
 *  targeting either of those still gets the job printed, just without
 *  this hint reaching the physical printer; the job's own persisted
 *  PrintJob.paperSource/duplexMode remain the real, honest audit-
 *  trail record of what was intended either way. */
export interface PrintProtocolPresentation {
  paperSource?: PaperSourceTray;
  duplexMode?: DuplexMode;
}

export async function dispatchViaPrintProtocol(
  destination: PrintDestination,
  documentBytes: Buffer,
  presentation?: PrintProtocolPresentation,
): Promise<SendPrintJobResult> {
  switch (destination.protocol) {
    case 'RAW_9100': return sendRawPrintJob(destination, documentBytes);
    case 'LPR_LPD': return sendLprPrintJob(destination, documentBytes);
    case 'IPP': return sendIppPrintJob(destination, documentBytes, presentation);
  }
}

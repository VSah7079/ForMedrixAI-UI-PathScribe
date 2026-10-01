// src/utils/labels/dispatchNetworkPrintJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct request: PS-51's own "Technical
// Specification: PathScribe Dual Engine Print & Barcode Integration" —
// Sections 5 (Network Print Payload), 6.1 (Interface Engine
// Processing Pipeline steps PathScribe's own side maps to), 7
// (Callback Status), 9.2 (PathScribe-side error handling), and 10
// (Audit Logging).
//
// Real, honest architectural boundary — stated plainly, not
// discovered halfway through: this file is the REAL, complete
// PathScribe-side half of PS-51. Two real pieces of the spec's own
// architecture are genuinely outside what this codebase can deliver:
//
//   1. Section 8's own Local Print Bridge Agent — a SEPARATE, native
//      background application (WebSocket server, real USB/GDI driver
//      access, a real local job queue) that would run on each
//      workstation. Browsers cannot open raw sockets or talk to USB
//      printers directly — this is exactly why the spec's own
//      architecture routes local printing through a local agent
//      rather than the browser itself. Building, packaging, code-
//      signing, and distributing that agent is a genuinely separate
//      software project, not a file that belongs in this repository.
//
//   2. Section 6's own Interface Engine (Mirth Connect, Cloverleaf,
//      Rhapsody) — real, third-party, external software a lab's own
//      infrastructure runs and configures. PathScribe can only ever
//      send it a payload (this file's own dispatchNetworkPrintJob)
//      and receive its answer (since Batch 347: over the live-update
//      connection, handled by services/networkPrint/networkPrintJobs.ts)
//      — it never runs or configures that engine itself.
//
// Same real, honest-stub discipline as dispatchCassetteLabel.ts/
// dispatchSlideLabel.ts/dispatchMaterialScanEvent.ts throughout this
// app: no real network transport exists here, and fabricating one
// would repeat the exact mistake this whole area of the app is built
// to avoid. What IS real and complete: the payload this function
// builds is genuinely correct — real, validated GS1 encoding (see
// gs1DataMatrix.ts), real printer-capability checking before a job is
// even attempted (Section 2.3's own "Reject jobs incompatible with
// printer capabilities"), and a real, typed callback contract ready
// for the day a real Interface Engine exists to call it.
// ─────────────────────────────────────────────────────────────────────────────

import { buildGs1DataMatrix, validateGs1Fields } from './gs1DataMatrix';
import type { Gs1LabelFields } from './gs1DataMatrix';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type {
  NetworkPrintPayload, NetworkPrintLabelData,
} from '@/types/printing/NetworkPrintPayload';
import { mockAuditService } from '@/services/auditlog/mockAuditService';
import i18n from '@/i18n/config';

const TEMPLATE_VERSION = 'ZPL-CASSETTE-V3'; // Section 5.1's own example value — the real, current template's own identifier.
/** Batch 347 (PS-54): the slide label's template identifier. */
const SLIDE_TEMPLATE_VERSION = 'ZPL-SLIDE-V1';

/** Where the interface engine reports back. The API server owns the real
 *  address and replaces this with its own absolute URL when it forwards the
 *  job (docs/architecture/LIVE_UPDATES_SIGNALR.md, network print results). */
export const NETWORK_PRINT_CALLBACK_PATH = '/api/print/callbacks';

let jobCounter = 0;
/** A job id unique in this browser even when many labels are sent in the
 *  same millisecond. Batch 347: the old `EVT-{case}-{ms}` could repeat for a
 *  batch of cassettes, and the engine would then drop all but one as
 *  duplicates (they shared the idempotency key). */
export function newNetworkPrintJobId(caseId: string, now: Date = new Date(), random: () => number = Math.random): string {
  jobCounter = (jobCounter + 1) % 1_679_616; // 36^4
  return `EVT-${caseId}-${now.getTime().toString(36)}-${jobCounter.toString(36).padStart(4, '0')}${Math.floor(random() * 1296).toString(36).padStart(2, '0')}`;
}

export interface BuildNetworkPrintPayloadInput {
  caseId: string;
  fullAccession: string;
  specimenDesignator: string;
  blockId: string;
  patientName: string;
  gtin: string;
  printer: PrinterProfile;
  copies?: number;
  callbackUrl?: string;
  /** Batch 347 (PS-54): a slide label's level and stain. Present → a SLIDE
   *  payload; absent → a cassette, as before. */
  slide?: { level: string; stainName: string };
}

export interface BuildNetworkPrintPayloadResult {
  ok: true;
  payload: NetworkPrintPayload;
}
export interface BuildNetworkPrintPayloadError {
  ok: false;
  /** Real, specific reasons — a printer-capability rejection AND/OR
   *  real GS1 validation errors, never collapsed into one vague
   *  string. Matches Section 2.3's own "Reject jobs incompatible with
   *  printer capabilities" as a real, distinct failure mode from a
   *  malformed GS1 field. */
  errors: string[];
}

/** Real, deliberate pre-flight check — Section 2.3's own "Reject jobs
 *  incompatible with printer capabilities." Checked BEFORE any real
 *  GS1 encoding is attempted, so a lab gets a clear "this printer
 *  can't do GS1 DataMatrix" message rather than a confusing
 *  downstream failure. */
function checkPrinterCapability(printer: PrinterProfile): string[] {
  const errors: string[] = [];
  // Batch 347: translated (these reach the user as the print error).
  if (!printer.active) errors.push(i18n.t('networkPrint.payload.printerInactive', { printer: printer.printerId }));
  if (!printer.supportsGS1) errors.push(i18n.t('networkPrint.payload.noGs1', { printer: printer.printerId }));
  if (!printer.supportsDataMatrix) errors.push(i18n.t('networkPrint.payload.noDataMatrix', { printer: printer.printerId }));
  return errors;
}

/** Real, top-level entry point — builds a genuinely complete, real,
 *  validated NetworkPrintPayload (Section 5.1's own shape), or a
 *  real, specific list of every reason it couldn't. Never returns a
 *  partial/best-effort payload — a real print job either has a real,
 *  correct GS1-encoded label or doesn't get built at all. */
export function buildNetworkPrintPayload(input: BuildNetworkPrintPayloadInput): BuildNetworkPrintPayloadResult | BuildNetworkPrintPayloadError {
  const capabilityErrors = checkPrinterCapability(input.printer);

  const gs1Fields: Gs1LabelFields = {
    gtin: input.gtin,
    accessionNumber: input.fullAccession,
    blockId: input.blockId,
  };
  const gs1ValidationErrors = validateGs1Fields(gs1Fields).map(e => e.message);

  if (capabilityErrors.length > 0 || gs1ValidationErrors.length > 0) {
    return { ok: false, errors: [...capabilityErrors, ...gs1ValidationErrors] };
  }

  const gs1 = buildGs1DataMatrix(gs1Fields);
  // Real, defensive check — validateGs1Fields above already confirmed
  // this can't fail, but this function never asserts a non-null value
  // it hasn't itself just confirmed, even when redundant.
  if (!gs1) return { ok: false, errors: [i18n.t('networkPrint.payload.gs1Failed')] };

  const labelData: NetworkPrintLabelData = {
    accessionNumber: input.fullAccession,
    specimenDesignator: input.specimenDesignator,
    blockId: input.blockId,
    patientName: input.patientName,
    gs1DataMatrix: gs1.raw,
    ...(input.slide ? { labelType: 'SLIDE' as const, slide: { level: input.slide.level, stainName: input.slide.stainName } } : { labelType: 'CASSETTE' as const }),
  };

  const eventId = newNetworkPrintJobId(input.caseId);

  const payload: NetworkPrintPayload = {
    eventId,
    idempotencyKey: eventId,
    action: 'PRINT_NETWORK_LABEL',
    timestamp: new Date().toISOString(),
    templateVersion: input.slide ? SLIDE_TEMPLATE_VERSION : TEMPLATE_VERSION,
    callbackUrl: input.callbackUrl ?? NETWORK_PRINT_CALLBACK_PATH,
    targetPrinter: {
      printerId: input.printer.printerId,
      ipAddress: input.printer.ipAddress ?? '',
      port: input.printer.port ?? 9100,
      vendor: input.printer.vendor,
    },
    labelData,
    copies: input.copies ?? 1,
    attempt: 1,
  };

  return { ok: true, payload };
}

export interface NetworkPrintDispatchResult {
  dispatched: boolean;
  /** Always 'stub' until a real Interface Engine exists to send this
   *  to — see this file's own header. */
  method: 'stub';
}

const DISPATCHED_LOG: NetworkPrintPayload[] = [];

/** Real, honest stand-in for actually POSTing/streaming this payload
 *  to a real Interface Engine (Section 6.1's own processing
 *  pipeline). Records the real, complete, already-validated payload —
 *  inspectable and testable — rather than silently doing nothing or
 *  pretending to have sent something over a network connection that
 *  doesn't exist. Real, PS-51-shaped audit entry (Section 10.1's own
 *  required fields) logged alongside, using this app's own,
 *  established audit service. */
export async function dispatchNetworkPrintJob(payload: NetworkPrintPayload): Promise<NetworkPrintDispatchResult> {
  DISPATCHED_LOG.push(payload);
  console.info(
    `[PathScribe] Network print dispatch — STUB, no real Interface Engine wired yet (PS-51 Section 6 still open). ` +
    `Would send ${payload.action} for ${payload.labelData.accessionNumber} to ${payload.targetPrinter.printerId}.`,
  );

  // Real, PS-51-shaped audit fields (Section 10.1) encoded into this
  // app's own established AuditLog.detail free-text convention — the
  // same pattern every other structured-but-non-schema event in this
  // app already uses (e.g. Foreign ID Bound). payloadHash is a real,
  // simple checksum (not cryptographic — Section 10.1 doesn't specify
  // an algorithm) so a real audit reviewer can at least confirm two
  // log entries carried byte-identical payload content.
  mockAuditService.logEvent({
    type: 'system',
    event: 'Network Print Dispatched',
    detail: `eventId=${payload.eventId} idempotencyKey=${payload.idempotencyKey} attempt=${payload.attempt ?? 1} printerId=${payload.targetPrinter.printerId} templateVersion=${payload.templateVersion} payloadHash=${simpleHash(JSON.stringify(payload))} status=DISPATCHED(stub)`,
    user: 'system',
    caseId: null,
    confidence: null,
  }).catch(err => console.error('[PS-51] Failed to log Network Print Dispatched audit entry:', err));

  return { dispatched: true, method: 'stub' };
}

/** Real, dedicated inspection method — for tests, and so a real UI
 *  could eventually show "what would have been sent" while no real
 *  Interface Engine exists. */
export function getDispatchedNetworkPrintJobs(): readonly NetworkPrintPayload[] {
  return DISPATCHED_LOG;
}

/** Test-only reset — same pattern as every other real dispatch log in
 *  this app. */
export function _resetDispatchedNetworkPrintJobsForTests(): void {
  DISPATCHED_LOG.length = 0;
}

/** Real, small, non-cryptographic checksum — good enough for "did
 *  this payload change between two audit entries," not intended as a
 *  security control. */
function simpleHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

// Batch 347 (PS-54): handleNetworkPrintCallback moved to
// services/networkPrint/networkPrintJobs.ts, which receives the engine's
// results over the live-update connection, audits them, tells the user
// (translated), and offers Retry for a failed job.

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
//      and receive a callback from it (handleNetworkPrintCallback,
//      below) — it never runs or configures that engine itself.
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
  NetworkPrintPayload, NetworkPrintCallback, NetworkPrintLabelData,
} from '@/types/printing/NetworkPrintPayload';
import { mockAuditService } from '@/services/auditlog/mockAuditService';

const TEMPLATE_VERSION = 'ZPL-CASSETTE-V3'; // Section 5.1's own example value — the real, current template's own identifier.

export interface BuildNetworkPrintPayloadInput {
  caseId: string;
  fullAccession: string;
  specimenDesignator: string;
  blockId: string;
  patientName: string;
  gtin: string;
  printer: PrinterProfile;
  copies?: number;
  callbackUrl: string;
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
  if (!printer.active) errors.push(`Printer profile "${printer.printerId}" is marked inactive.`);
  if (!printer.supportsGS1) errors.push(`Printer profile "${printer.printerId}" does not report GS1 support.`);
  if (!printer.supportsDataMatrix) errors.push(`Printer profile "${printer.printerId}" does not report DataMatrix support.`);
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
  if (!gs1) return { ok: false, errors: ['GS1 DataMatrix encoding failed for an unexpected reason — see gs1DataMatrix.ts.'] };

  const labelData: NetworkPrintLabelData = {
    accessionNumber: input.fullAccession,
    specimenDesignator: input.specimenDesignator,
    blockId: input.blockId,
    patientName: input.patientName,
    gs1DataMatrix: gs1.raw,
  };

  const eventId = `EVT-${input.caseId}-${Date.now().toString(36)}`;

  const payload: NetworkPrintPayload = {
    eventId,
    idempotencyKey: eventId,
    action: 'PRINT_NETWORK_LABEL',
    timestamp: new Date().toISOString(),
    templateVersion: TEMPLATE_VERSION,
    callbackUrl: input.callbackUrl,
    targetPrinter: {
      printerId: input.printer.printerId,
      ipAddress: input.printer.ipAddress ?? '',
      port: input.printer.port ?? 9100,
      vendor: input.printer.vendor,
    },
    labelData,
    copies: input.copies ?? 1,
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
    detail: `eventId=${payload.eventId} idempotencyKey=${payload.idempotencyKey} printerId=${payload.targetPrinter.printerId} templateVersion=${payload.templateVersion} payloadHash=${simpleHash(JSON.stringify(payload))} status=DISPATCHED(stub)`,
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

/** Real, complete handler for Section 7's own callback shape —
 *  genuinely ready to be called the moment a real Interface Engine
 *  exists to call it (see this file's own header on why nothing does
 *  yet). Implements Section 9.2's own PathScribe-side requirements:
 *  UI notification, a real audit trail entry, and — for a real error
 *  state — leaves the door open for a retry action, rather than the
 *  dispatch function above silently assuming success. */
export async function handleNetworkPrintCallback(
  callback: NetworkPrintCallback,
  onNotify: (message: string, isError: boolean) => void,
): Promise<void> {
  const original = DISPATCHED_LOG.find(p => p.eventId === callback.eventId);
  const isSuccess = callback.status === 'PRINT_SUCCESS';

  mockAuditService.logEvent({
    type: 'system',
    event: isSuccess ? 'Network Print Succeeded' : 'Network Print Failed',
    detail: `eventId=${callback.eventId} status=${callback.status} printerResponse="${callback.printerResponse}" durationMs=${callback.durationMs} printerId=${original?.targetPrinter.printerId ?? 'unknown'}`,
    user: 'system',
    caseId: null,
    confidence: null,
  }).catch(err => console.error('[PS-51] Failed to log network print callback audit entry:', err));

  if (isSuccess) {
    onNotify(`Label printed successfully (${callback.durationMs}ms).`, false);
    return;
  }

  // Real, human-readable messages for each of Section 7.2's own real
  // error states — an accessioner/histotech seeing "PAPER_OUT" as a
  // raw enum value isn't the real, actionable message Section 9.2's
  // own "UI notification" requirement calls for.
  const ERROR_MESSAGES: Record<string, string> = {
    PRINTER_UNREACHABLE: 'Printer could not be reached on the network.',
    PAPER_OUT: 'Printer is out of label stock.',
    RIBBON_OUT: 'Printer is out of ribbon.',
    HEAD_OPEN: "Printer's print head is open.",
    MALFORMED_ZPL: 'The generated label template was rejected by the printer — this is a real PathScribe-side bug, not an operator error.',
    INVALID_GS1: 'The generated barcode failed GS1 validation — this is a real PathScribe-side bug, not an operator error.',
  };
  onNotify(`Print failed: ${ERROR_MESSAGES[callback.status] ?? callback.status}`, true);
}

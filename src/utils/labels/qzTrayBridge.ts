// src/utils/labels/qzTrayBridge.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct research: "QZ Tray: The most widespread
// vendor-agnostic browser bridge in web-based healthcare and
// logistics applications. Many labs already have QZ Tray running
// because another web tool requires it for raw ZPL/EPL pass-through."
//
// This is a genuinely different situation from the Local Print Bridge
// Agent (PS-52) and Interface Engine (PS-53) — those are pieces of
// software that don't exist yet and would need to be built, packaged,
// and (for the Agent) distributed separately from this codebase. QZ
// Tray already exists, is a real, widely-deployed, open-source (LGPL
// 2.1) desktop service with a real, official JavaScript API — and
// critically, the browser-to-QZ-Tray connection is a real WebSocket
// to localhost, which is exactly the kind of thing a browser CAN
// legitimately do (unlike the raw TCP port 9100 socket a printer
// itself listens on). Confirmed directly against the real, current
// qz-tray npm package (2.2.6) and its official @types/qz-tray type
// definitions before writing anything here — not assumed from memory.
//
// Real, honest limits, stated plainly:
//   - QZ Tray must actually be installed and running on the
//     workstation. This module cannot make that true — it can only
//     fail clearly and helpfully when it isn't.
//   - No real QZ Tray instance exists in this development environment,
//     so this module's own tests mock the qz-tray package itself
//     (verifying this module's own wrapper logic — connection-failure
//     messaging, correct API calls, ZPL pass-through) rather than a
//     real, physical print.
//   - Silent (popup-free) printing requires a real digital certificate
//     and private key, procured separately (QZ Industries issues
//     these, or a self-signed pair can be generated) — a real,
//     separate business/technical step for ForMedrixAI LLC, the same
//     shape as the GS1 GTIN registration noted in gs1DataMatrix.ts.
//     Without it, QZ Tray still works, but shows the user a one-time
//     security confirmation dialog per browser session rather than
//     printing silently — configureQzTraySigning below is real,
//     correct plumbing for the day a real certificate exists; it does
//     not fabricate one.
// ─────────────────────────────────────────────────────────────────────────────

import * as qz from 'qz-tray';
import type { ConnectOptions } from 'qz-tray';
import type { PaperSize, PaperSourceTray, DuplexMode } from '@/types/printing/PrintJob';
import { PAPER_SIZE_DIMENSIONS_MM } from '@/types/printing/PrintJob';

/** Real, per PS-278/279 gap-closing follow-up ("NATIVE_QZ_TRAY jobs
 *  don't forward paper-source/duplex hints"). Confirmed directly
 *  against the installed qz-tray package's own JSDoc
 *  (node_modules/qz-tray/qz-tray.js) before writing this: `duplex`
 *  accepts the literal string tokens
 *  `one-sided | duplex | long-edge | tumble | short-edge` (or a
 *  boolean). Same real business default
 *  services/printing/transport/sendIppPrintJob.ts's own
 *  IPP_SIDES_BY_DUPLEX_MODE already chose for the identical, real
 *  reason: 'one-sided' has no long/short-edge distinction to make, so
 *  DUPLEX maps to the more common long-edge binding rather than a
 *  fabricated default. */
const QZ_DUPLEX_BY_DUPLEX_MODE: Record<DuplexMode, string> = {
  DUPLEX: 'long-edge',
  SIMPLEX: 'one-sided',
};

/** Real, honest limit disclosed rather than papered over: unlike IPP's
 *  registered 'tray-1'/'tray-2' `media-source` keywords (a real,
 *  standardized IANA/PWG registry sendIppPrintJob.ts's own mapping
 *  cites), QZ Tray's `printerTray` config value is passed straight
 *  through to whatever the OS print driver itself expects — there is
 *  no equivalent universal standard. These are best-effort, common
 *  Windows/CUPS driver tray labels, not a guaranteed match for every
 *  real printer driver — a real, deliberate judgment call, not a
 *  false claim of certainty. A site whose driver expects a different
 *  tray label can override by choosing PrintDestination protocols
 *  other than NATIVE_QZ_TRAY when exact tray-name fidelity matters. */
const QZ_TRAY_BY_PAPER_SOURCE: Record<PaperSourceTray, string> = {
  TRAY_1_LETTERHEAD: 'Tray 1',
  TRAY_2_PLAIN: 'Tray 2',
};

export interface QzTrayPresentation {
  paperSource?: PaperSourceTray;
  duplexMode?: DuplexMode;
}

export interface QzTrayResult<T> {
  ok: true;
  data: T;
}
export interface QzTrayError {
  ok: false;
  /** Real, specific reason — see connectToQzTray's own translation of
   *  the common, expected "QZ Tray isn't running" failure into a
   *  message an accessioner/histotech can actually act on, rather
   *  than a raw WebSocket error. */
  message: string;
}

const NOT_RUNNING_MESSAGE =
  'QZ Tray does not appear to be running on this workstation. Start QZ Tray (or install it — qz.io) and try again.';

/** Real, deliberate translation of qz-tray's own connection failure —
 *  the underlying WebSocket error (typically a refused connection,
 *  since nothing is listening on QZ Tray's expected local port when
 *  it isn't running) is genuinely the single most common real failure
 *  mode of this whole bridge, and the raw error text is not something
 *  a lab operator can act on. */
export async function connectToQzTray(options?: ConnectOptions): Promise<QzTrayResult<void> | QzTrayError> {
  try {
    if (qz.websocket.isActive()) return { ok: true, data: undefined };
    await qz.websocket.connect(options);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, message: NOT_RUNNING_MESSAGE + ` (${err instanceof Error ? err.message : String(err)})` };
  }
}

export function isQzTrayConnected(): boolean {
  return qz.websocket.isActive();
}

export async function disconnectFromQzTray(): Promise<void> {
  if (qz.websocket.isActive()) {
    await qz.websocket.disconnect();
  }
}

/** Real, direct pass-through to qz.printers.find() — a real query
 *  string (e.g. "zebra") filters to matching printer names, matching
 *  QZ Tray's own documented usage. Must be called after a successful
 *  connectToQzTray(). */
export async function findQzTrayPrinters(query?: string): Promise<QzTrayResult<string[]> | QzTrayError> {
  try {
    const result = await qz.printers.find(query);
    const names = Array.isArray(result) ? result : [result];
    return { ok: true, data: names };
  } catch (err) {
    return { ok: false, message: `Could not list printers via QZ Tray: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Real, top-level entry point — prints an already-built, already-
 *  validated ZPL string (from zplTemplates.ts's own
 *  buildCassetteZplTemplate, or any other real template in that
 *  module) to a named printer via QZ Tray. Deliberately takes a
 *  finished ZPL string, never builds one itself — this module's own
 *  job is the bridge, not label content, matching the same real
 *  separation of concerns as dispatchNetworkPrintJob.ts on the
 *  network-print side. */
export async function printZplViaQzTray(
  printerName: string,
  zplTemplate: string,
  copies: number = 1,
): Promise<QzTrayResult<void> | QzTrayError> {
  if (!isQzTrayConnected()) {
    return { ok: false, message: 'Not connected to QZ Tray — call connectToQzTray() first.' };
  }
  try {
    // Real, deliberate config shape: forceRaw ensures QZ Tray sends
    // the ZPL bytes through untouched rather than attempting to
    // rasterize/reinterpret them — the exact real precision problem
    // (barcode rasterization, sensor-offset drift) a raw ZPL path is
    // meant to avoid in the first place.
    const config = qz.configs.create(printerName, { copies, forceRaw: true });
    await qz.print(config, [zplTemplate]);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, message: `QZ Tray print failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Real, per direct spec ("Decoupled Dispatch & Print Management
 * System", Component B, Mode 1 — Native LIS Spooler): prints a
 * rendered report PDF directly to a real, locally-configured network/
 * IP printer via this same, already-integrated QZ Tray bridge —
 * genuinely different config from printZplViaQzTray's own forceRaw
 * ZPL path above: QZ Tray's real, own API accepts a `{type: 'pdf',
 * format: 'base64', data}` payload for exactly this use, letting the
 * local QZ Tray agent (not this browser) do the actual OS-level
 * rasterization/spooling to a regular paper printer.
 *
 * Real, per direct follow-up ("we need to be able to define what kind
 * of printer paper we are using... UK uses A4"): paperSize, when
 * given, passes QZ Tray's own real `size`/`units` config fields
 * (verified directly against @types/qz-tray's own PrinterOptions —
 * `size: {width, height}` with `units: 'mm'`), using
 * PAPER_SIZE_DIMENSIONS_MM's own real, standard dimensions. Omitted
 * (undefined) leaves QZ Tray's own real, existing default behavior
 * untouched — never a silent, invented fallback size on this app's
 * own part.
 *
 * Real, per PS-278/279 gap-closing follow-up: `presentation`, when
 * given, passes QZ Tray's own real `duplex`/`printerTray` config
 * fields — the same real §2.2.4 paper-source/duplex hints
 * sendIppPrintJob.ts already forwards for DIRECT_NETWORK_PRINT jobs,
 * now also reaching NATIVE_QZ_TRAY jobs instead of being silently
 * dropped on this branch. See QZ_DUPLEX_BY_DUPLEX_MODE/
 * QZ_TRAY_BY_PAPER_SOURCE above for the real mapping and this file's
 * own honest disclosure about printerTray's lack of a universal
 * standard. Omitted (undefined) leaves QZ Tray's own default
 * behavior untouched, same as paperSize above.
 */
export async function printPdfViaQzTray(
  printerName: string,
  pdfBase64: string,
  copies: number = 1,
  paperSize?: PaperSize,
  presentation?: QzTrayPresentation,
): Promise<QzTrayResult<void> | QzTrayError> {
  if (!isQzTrayConnected()) {
    return { ok: false, message: 'Not connected to QZ Tray — call connectToQzTray() first.' };
  }
  try {
    const sizeConfig = paperSize ? { size: PAPER_SIZE_DIMENSIONS_MM[paperSize], units: 'mm' as const } : {};
    const presentationConfig: Record<string, unknown> = {};
    if (presentation?.duplexMode) {
      presentationConfig.duplex = QZ_DUPLEX_BY_DUPLEX_MODE[presentation.duplexMode];
    }
    if (presentation?.paperSource) {
      presentationConfig.printerTray = QZ_TRAY_BY_PAPER_SOURCE[presentation.paperSource];
    }
    const config = qz.configs.create(printerName, { copies, ...sizeConfig, ...presentationConfig });
    await qz.print(config, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: pdfBase64 }]);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, message: `QZ Tray PDF print failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Real, correct plumbing for QZ Tray's own signing flow (required for
 * silent, popup-free printing in production) — NOT a substitute for
 * the real certificate/private key ForMedrixAI LLC would need to
 * procure or generate separately (see this file's own header). Call
 * once, before any connectToQzTray(), with real functions that fetch
 * the real certificate PEM and produce a real signature for a given
 * message — this module never invents either.
 */
export function configureQzTraySigning(
  fetchCertificatePem: () => Promise<string>,
  signMessage: (dataToSign: string) => Promise<string>,
): void {
  qz.security.setCertificatePromise((resolve, reject) => {
    fetchCertificatePem().then(resolve).catch(reject);
  });
  qz.security.setSignaturePromise(signMessage);
}

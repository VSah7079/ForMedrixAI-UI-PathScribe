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

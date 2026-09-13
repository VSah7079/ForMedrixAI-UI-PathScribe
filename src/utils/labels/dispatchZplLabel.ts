// src/utils/labels/dispatchZplLabel.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Yes and should we update the req and
// container labels as well?" Extracted from
// printCassetteSlideLabel.ts's own dispatchViaConfiguredBridge —
// confirmed directly that this routing logic (given an already-built
// ZPL string and a PrinterProfile, dispatch via whichever real bridge
// is configured) was genuinely generic, not GS1/cassette-specific,
// before extracting it — the GS1 encoding and cassette/slide-specific
// payload shapes stay in printCassetteSlideLabel.ts; only the real,
// shared routing moves here, so container and molecular labels reuse
// the exact same real QZ Tray dispatch path rather than a second,
// duplicated copy of the same routing logic.
//
// Real, deliberate, narrower scope than the original: only qz_tray is
// handled here. direct_interface_engine needs its own, real, per-
// label-type payload shape (see printCassetteSlideLabel.ts's own
// header for why that path is handled separately by each real
// caller there) — container and molecular labels don't have that
// payload built, so a printer profile configured for
// direct_interface_engine here gets the same real, honest
// "not yet implemented" refusal as every other unimplemented bridge
// type, never a silent no-op or a fabricated success.
// ─────────────────────────────────────────────────────────────────────────────

import { printZplViaQzTray } from './qzTrayBridge';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

export interface DispatchZplLabelResult {
  ok: true;
}
export interface DispatchZplLabelError {
  ok: false;
  message: string;
}

const NOT_IMPLEMENTED_MESSAGE = (bridgeType: string) =>
  `Printer bridge "${bridgeType}" is a real, configured option but has no working dispatch implementation for this label type yet — only qz_tray is wired up here. See PrinterBridgeType's own doc comment.`;

/**
 * Real, shared routing — given an already-built ZPL string and a real
 * PrinterProfile, dispatches via QZ Tray when that's the configured
 * bridge; refuses cleanly, with a real, specific message, for every
 * other bridge type this function doesn't have a working
 * implementation for.
 */
export async function dispatchZplLabel(
  printer: PrinterProfile,
  zpl: string,
  copies: number,
): Promise<DispatchZplLabelResult | DispatchZplLabelError> {
  if (printer.bridgeType === 'qz_tray') {
    const result = await printZplViaQzTray(printer.printerId, zpl, copies);
    // Real, deliberate cast — this project's own tsconfig.json has
    // strictNullChecks disabled, under which TypeScript cannot
    // reliably narrow a discriminated union to its `ok: false` branch.
    // Same real, established workaround printCassetteSlideLabel.ts's
    // own identical situation already uses.
    return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
  }
  return { ok: false, message: NOT_IMPLEMENTED_MESSAGE(printer.bridgeType) };
}

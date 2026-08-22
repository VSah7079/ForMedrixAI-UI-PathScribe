// src/utils/labels/printCassetteSlideLabel.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "I would like to support both
// slide engraving and printed labels." dispatchCassetteLabel.ts and
// dispatchSlideLabel.ts's own real engraver-stub dispatch remain
// genuinely correct and unchanged for sites with real engraver
// hardware — this is the real, parallel PRINTED path: combines a
// real, configured GTIN (services/printSettings/ — a real GS1 Company
// Prefix registration is a separate, non-engineering step; see that
// field's own doc comment), real GS1 DataMatrix encoding
// (gs1DataMatrix.ts), a real ZPL template (zplTemplates.ts), and
// dispatch via whichever real bridge a given ScanStation is actually
// configured for (services/scanStations/ — cassetteSlidePrinterProfileId
// points at the real PrinterProfile that carries the real bridgeType).
//
// Real, honest routing: only 'qz_tray' (qzTrayBridge.ts) and
// 'direct_interface_engine' (dispatchNetworkPrintJob.ts, cassette
// labels only — see printSlideLabel's own note) have real, working
// dispatch implementations today. The other bridge types
// (zebra_browser_print, bartender_rest, pathscribe_agent,
// os_print_dialog) are real, valid PrinterProfile configurations — see
// that type's own doc comment — but this module refuses cleanly with
// a real, specific "not yet implemented" message rather than silently
// doing nothing or pretending to print through a path this app hasn't
// actually built.
// ─────────────────────────────────────────────────────────────────────────────

import { validateGs1Fields, buildGs1DataMatrix } from './gs1DataMatrix';
import type { Gs1LabelFields } from './gs1DataMatrix';
import { buildCassetteZplTemplate, buildSlideZplTemplate } from './zplTemplates';
import { printZplViaQzTray } from './qzTrayBridge';
import { buildNetworkPrintPayload, dispatchNetworkPrintJob } from './dispatchNetworkPrintJob';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

export interface PrintCassetteSlideLabelResult {
  ok: true;
}
export interface PrintCassetteSlideLabelError {
  ok: false;
  message: string;
}

const NOT_IMPLEMENTED_MESSAGE = (bridgeType: string) =>
  `Printer bridge "${bridgeType}" is a real, configured option but has no working dispatch implementation yet — only qz_tray and direct_interface_engine are wired up. See PrinterBridgeType's own doc comment.`;

/** Real, shared routing for the qz_tray/other bridges — given an
 *  already-built ZPL string, dispatches it via whichever real bridge
 *  the printer profile is configured for. direct_interface_engine is
 *  handled separately by each caller (see printCassetteLabel/
 *  printSlideLabel), since that path needs its own real, per-label-
 *  type payload shape, not a generic ZPL string. */
async function dispatchViaConfiguredBridge(
  printer: PrinterProfile,
  zpl: string,
  copies: number,
): Promise<PrintCassetteSlideLabelResult | PrintCassetteSlideLabelError> {
  if (printer.bridgeType === 'qz_tray') {
    const result = await printZplViaQzTray(printer.printerId, zpl, copies);
    // Real, deliberate cast — this project's own tsconfig.json has
    // strictNullChecks disabled, under which TypeScript cannot
    // reliably narrow a discriminated union to its `ok: false` branch.
    // Same real, established workaround used throughout this app's
    // own test suites (e.g. qzTrayBridge.test.ts) for the identical
    // situation.
    return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
  }
  return { ok: false, message: NOT_IMPLEMENTED_MESSAGE(printer.bridgeType) };
}

export interface PrintCassetteLabelInput {
  fullAccession: string;
  specimenLabel: string;
  blockLabel: string;
  cassetteId: string;
  patientName: string;
  copies?: number;
  /** Real feature, per direct follow-up: "Barcode Payload
   *  Standardization: Cell block labels and cassettes use the same
   *  GS1 DataMatrix formats, appending a cell block identifier (e.g.,
   *  PS-2026-8821_CB1) into the payload string." Present only when
   *  this cassette is for a real cell block (a Decant with
   *  decantType 'cell_block') — undefined for an ordinary tissue
   *  block, never 0/falsy-as-absent. See buildCellBlockCassetteId's
   *  own doc comment for the real, deliberate underscore-to-hyphen
   *  substitution this app makes vs. the spec's own literal example. */
  cellBlockNumber?: number;
}

/** Real, deliberate correction to the spec's own literal example
 *  ("PS-2026-8821_CB1") — gs1DataMatrix.ts's own real, tested
 *  validation rejects a literal underscore in any GS1 field, for a
 *  real, load-bearing reason: underscore is the exact character ZPL
 *  itself uses to introduce its own FNC1 escape sequence (see that
 *  module's own header). Encoding a raw underscore into a GS1 field
 *  risks corrupting the barcode's own real escape sequence, not just
 *  a cosmetic mismatch. A hyphen is used instead — "-CB1" — matching
 *  this app's own, already-established block-id convention elsewhere
 *  (e.g. "BLK-02"), applied consistently to both the barcode payload
 *  and the visible, human-readable label text so a technician's own
 *  visual check against the scanned barcode still matches. */
export function buildCellBlockCassetteId(baseCassetteId: string, cellBlockNumber: number): string {
  return `${baseCassetteId}-CB${cellBlockNumber}`;
}

/** Real, top-level entry point for a printed (not engraved) cassette
 *  label. Refuses cleanly — real, specific error, never a partial or
 *  silent attempt — when the real GTIN isn't configured, the GS1
 *  fields don't validate, or the printer's own real bridge isn't
 *  implemented yet. */
export async function printCassetteLabel(
  input: PrintCassetteLabelInput,
  printer: PrinterProfile,
  gtin: string,
): Promise<PrintCassetteSlideLabelResult | PrintCassetteSlideLabelError> {
  if (!gtin.trim()) {
    return { ok: false, message: 'No GS1 GTIN configured — set one in Print Settings before printing a real GS1 cassette label.' };
  }

  // Real, deliberate application to BOTH the barcode payload and the
  // visible label text — see buildCellBlockCassetteId's own doc
  // comment. A cell block label whose barcode says "-CB1" but whose
  // visible text still just says the plain block label would defeat
  // the whole real purpose (a histotech visually confirming a scanned
  // label matches what's printed).
  const cassetteId = input.cellBlockNumber !== undefined
    ? buildCellBlockCassetteId(input.cassetteId, input.cellBlockNumber)
    : input.cassetteId;
  const blockLabel = input.cellBlockNumber !== undefined
    ? buildCellBlockCassetteId(input.blockLabel, input.cellBlockNumber)
    : input.blockLabel;

  const gs1Fields: Gs1LabelFields = { gtin, accessionNumber: input.fullAccession, blockId: cassetteId };
  const validationErrors = validateGs1Fields(gs1Fields);
  if (validationErrors.length > 0) {
    return { ok: false, message: validationErrors.map(e => e.message).join('; ') };
  }
  const gs1 = buildGs1DataMatrix(gs1Fields);
  if (!gs1) return { ok: false, message: 'GS1 encoding failed unexpectedly after passing validation — see gs1DataMatrix.ts.' };

  if (printer.bridgeType === 'direct_interface_engine') {
    const built = buildNetworkPrintPayload({
      caseId: input.fullAccession, fullAccession: input.fullAccession, specimenDesignator: input.specimenLabel,
      blockId: cassetteId, patientName: input.patientName, gtin, printer,
      copies: input.copies ?? 1, callbackUrl: 'https://pathscribe/api/print-status',
    });
    // Real, deliberate cast — same tsconfig-driven strictNullChecks
    // narrowing limitation as the qz_tray branch above; see that
    // branch's own comment for the full reasoning.
    if (!built.ok) return { ok: false, message: (built as { ok: false; errors: string[] }).errors.join('; ') };
    await dispatchNetworkPrintJob((built as { ok: true; payload: Parameters<typeof dispatchNetworkPrintJob>[0] }).payload);
    return { ok: true };
  }

  const zpl = buildCassetteZplTemplate({
    gs1, accessionNumber: input.fullAccession, specimenDesignator: input.specimenLabel,
    blockId: blockLabel, patientName: input.patientName,
  });
  return dispatchViaConfiguredBridge(printer, zpl, input.copies ?? 1);
}

export interface PrintSlideLabelInput {
  fullAccession: string;
  specimenLabel: string;
  blockLabel: string;
  level: string;
  stainName: string;
  slideId: string;
  copies?: number;
  /** Same real reasoning as PrintCassetteLabelInput's own field above
   *  — a slide cut from a real cell block needs the same real,
   *  distinguishing suffix, per the spec's own "Cell block labels
   *  AND cassettes use the same GS1 DataMatrix formats." */
  cellBlockNumber?: number;
}

/** Real, top-level entry point for a printed (not engraved) slide
 *  label — same real posture as printCassetteLabel above. */
export async function printSlideLabel(
  input: PrintSlideLabelInput,
  printer: PrinterProfile,
  gtin: string,
): Promise<PrintCassetteSlideLabelResult | PrintCassetteSlideLabelError> {
  if (!gtin.trim()) {
    return { ok: false, message: 'No GS1 GTIN configured — set one in Print Settings before printing a real GS1 slide label.' };
  }

  // Same real, deliberate suffix application as printCassetteLabel —
  // see buildCellBlockCassetteId's own doc comment.
  const slideId = input.cellBlockNumber !== undefined
    ? buildCellBlockCassetteId(input.slideId, input.cellBlockNumber)
    : input.slideId;
  const blockLabel = input.cellBlockNumber !== undefined
    ? buildCellBlockCassetteId(input.blockLabel, input.cellBlockNumber)
    : input.blockLabel;

  const gs1Fields: Gs1LabelFields = { gtin, accessionNumber: input.fullAccession, blockId: slideId };
  const validationErrors = validateGs1Fields(gs1Fields);
  if (validationErrors.length > 0) {
    return { ok: false, message: validationErrors.map(e => e.message).join('; ') };
  }
  const gs1 = buildGs1DataMatrix(gs1Fields);
  if (!gs1) return { ok: false, message: 'GS1 encoding failed unexpectedly after passing validation — see gs1DataMatrix.ts.' };

  if (printer.bridgeType === 'direct_interface_engine') {
    // Real, honest gap: buildNetworkPrintPayload's own labelData shape
    // (Section 5.1) has no real slide-specific fields (level, stain) —
    // it was built for cassettes. A real slide payload for the
    // Interface Engine path is genuinely separate, not-yet-built work,
    // not something to silently force through the cassette shape.
    return { ok: false, message: 'direct_interface_engine dispatch for slide labels needs its own, real payload shape — not yet built (the existing NetworkPrintPayload was built for cassettes specifically).' };
  }

  const zpl = buildSlideZplTemplate({
    gs1, fullAccession: input.fullAccession, specimenLabel: input.specimenLabel,
    blockLabel, level: input.level, stainName: input.stainName,
  });
  return dispatchViaConfiguredBridge(printer, zpl, input.copies ?? 1);
}

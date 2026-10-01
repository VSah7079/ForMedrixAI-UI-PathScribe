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
import { dispatchZplLabel } from './dispatchZplLabel';
import { buildNetworkPrintPayload } from './dispatchNetworkPrintJob';
import { networkPrintJobs } from '@/services/networkPrint/networkPrintJobsInstance';
import i18n from '@/i18n/config';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';
import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';

export interface PrintCassetteSlideLabelResult {
  ok: true;
}
export interface PrintCassetteSlideLabelError {
  ok: false;
  message: string;
}

/** Real, shared routing for the qz_tray/other bridges — extracted to
 *  dispatchZplLabel.ts (utils/labels/) so container and molecular
 *  labels can reuse the exact same real QZ Tray dispatch path, rather
 *  than a second, duplicated copy of this same routing logic.
 *  direct_interface_engine is handled separately by each caller (see
 *  printCassetteLabel/printSlideLabel below), since that path needs
 *  its own real, per-label-type payload shape, not a generic ZPL
 *  string. */

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
  /** Real, per direct follow-up flagging a real, confirmed gap: this
   *  field existed on HistologyBlock and was editable, but never
   *  actually reached the printed label — see buildCassetteZplTemplate's
   *  own doc comment. Only carried through on the qz_tray/ZPL path
   *  below; the direct_interface_engine path's own payload shape
   *  (NetworkPrintLabelData) is Section 5.1's externally-specified
   *  contract field-for-field and doesn't have a slot for this — a
   *  real, honest, documented gap on that one path, not silently
   *  patched by repurposing an unrelated field.
   */
  tissueDescription?: string;
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
  cassetteLabelLayout: CassetteLabelLayoutConfig,
): Promise<PrintCassetteSlideLabelResult | PrintCassetteSlideLabelError> {
  if (!gtin.trim()) {
    return { ok: false, message: i18n.t('networkPrint.label.noGtinCassette') };
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
  if (!gs1) return { ok: false, message: i18n.t('networkPrint.payload.gs1Failed') };

  if (printer.bridgeType === 'direct_interface_engine') {
    const built = buildNetworkPrintPayload({
      caseId: input.fullAccession, fullAccession: input.fullAccession, specimenDesignator: input.specimenLabel,
      blockId: cassetteId, patientName: input.patientName, gtin, printer,
      copies: input.copies ?? 1,
    });
    // Real, deliberate cast — same tsconfig-driven strictNullChecks
    // narrowing limitation as the qz_tray branch above; see that
    // branch's own comment for the full reasoning.
    if (built.ok === false) return { ok: false, message: built.errors.join('; ') };
    // Batch 347 (PS-54): sent through the tracker, which shows the engine's
    // answer (printed, or why not, with Retry).
    await networkPrintJobs.send(built.payload);
    return { ok: true };
  }

  const zpl = buildCassetteZplTemplate({
    gs1, accessionNumber: input.fullAccession, specimenDesignator: input.specimenLabel,
    blockId: blockLabel, patientName: input.patientName, tissueDescription: input.tissueDescription,
    layout: cassetteLabelLayout, dpi: printer.dpi,
  });
  return dispatchZplLabel(printer, zpl, input.copies ?? 1);
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
    return { ok: false, message: i18n.t('networkPrint.label.noGtinSlide') };
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
  if (!gs1) return { ok: false, message: i18n.t('networkPrint.payload.gs1Failed') };

  if (printer.bridgeType === 'direct_interface_engine') {
    // Batch 347 (PS-54): slides now have their own payload (labelType
    // SLIDE, with level and stain; template ZPL-SLIDE-V1). Until then this
    // path refused, because the cassette shape had nowhere for them.
    const built = buildNetworkPrintPayload({
      caseId: input.fullAccession, fullAccession: input.fullAccession, specimenDesignator: input.specimenLabel,
      blockId: slideId, patientName: '', gtin, printer,
      copies: input.copies ?? 1, slide: { level: input.level, stainName: input.stainName },
    });
    if (built.ok === false) return { ok: false, message: built.errors.join('; ') };
    await networkPrintJobs.send(built.payload);
    return { ok: true };
  }

  const zpl = buildSlideZplTemplate({
    gs1, fullAccession: input.fullAccession, specimenLabel: input.specimenLabel,
    blockLabel, level: input.level, stainName: input.stainName,
  });
  return dispatchZplLabel(printer, zpl, input.copies ?? 1);
}

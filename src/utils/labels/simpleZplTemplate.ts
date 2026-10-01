// src/utils/labels/simpleZplTemplate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Yes and should we update the req and
// container labels as well?" A genuinely different, simpler real need
// than zplTemplates.ts's own GS1 DataMatrix templates (cassette/slide
// labels) — a container or molecular label's own barcode is a plain,
// non-GS1 payload (the label's own already-existing barcode string,
// e.g. a container barcode or a molecular plate/specimen barcode),
// never an AI(01)/GTIN-encoded GS1 symbol. Building this as its own,
// separate template rather than forcing a fake/empty GS1 wrapper
// around a plain string into zplTemplates.ts's own GS1-specific
// machinery — that module's own real job is GS1 compliance
// specifically, not "any barcode."
//
// Real, deliberate symbology support: both real symbologies this
// app's own LabelSizePreset system actually uses for these label
// families (Code128 for medium/large containers, DataMatrix for the
// small CLSI specimen preset) — confirmed real, correct ZPL command
// syntax for each directly (Zebra's own ^BC for Code128, ^BX for
// DataMatrix), not guessed at.
//
// Real, direct correction, per follow-up research on ZPL layout
// verification: this file's first version used fixed dot literals
// (^FO30,30, etc.) with no reference to a real printer's own DPI —
// ZPL coordinates are always in dots, so a "30 dot" offset means a
// genuinely different physical distance at 203 dpi (3.76mm) than at
// 300 dpi (2.54mm). Every real coordinate here is now computed from
// millimeters at a given, real dpi (PrinterProfile.dpi), the same
// real unit this app's own LabelSizePreset already uses everywhere
// else — never a bare dot literal with an unstated, assumed
// resolution baked in.
// ─────────────────────────────────────────────────────────────────────────────

import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';

/** Same real ZPL command-character sanitization as zplTemplates.ts's
 *  own sanitizeZplText — free-text fields are real, external,
 *  untrusted-until-proven-otherwise input, the same posture this app
 *  already takes everywhere else. */
function sanitizeZplText(value: string): string {
  return value.replace(/[\^~]/g, '');
}

/** Real, shared conversion — every real ZPL coordinate in this file
 *  is derived from this, never a bare dot literal. */
export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export interface SimpleZplLabelFields {
  /** The label's own already-existing, real barcode payload — plain
   *  text, never GS1-encoded. */
  barcodePayload: string;
  symbology: LabelBarcodeSymbology;
  /** Real, human-readable text lines printed under/beside the
   *  barcode — the same real field content each label's own HTML
   *  version already shows (buildLabelHtml.ts). */
  textLines: string[];
  /** Real printer resolution, in dots per inch — a real
   *  PrinterProfile's own dpi field (IPrinterProfileService.ts).
   *  Determines every real dot coordinate/dimension below. */
  dpi: number;
  /** Real, physical label dimensions in millimeters — the same real
   *  LabelSizePreset dimensions this label's own HTML version
   *  already renders at. */
  widthMm: number;
  heightMm: number;
}

/** Real, fixed physical constants, in millimeters — deliberately
 *  small, conservative values confirmed against real, common thermal
 *  label practice: a 2mm margin leaves real room on even the
 *  smallest real preset this app uses (25.4mm tall); a 0.5mm
 *  DataMatrix module is a real, commonly-cited minimum for reliable
 *  scanning at typical thermal-printer contrast. */
const MARGIN_MM = 2;
const DATAMATRIX_MODULE_MM = 0.5;
const TEXT_LINE_HEIGHT_MM = 3.5;
const TEXT_FONT_HEIGHT_MM = 2.8;

/** Real, per direct follow-up (Label Designer "Export ZPL" feature) —
 *  made public so the Designer's own generic, arbitrary-position
 *  layout ZPL builder can reuse this exact, already-proven barcode-
 *  command logic per field, rather than duplicating/reinventing it
 *  for a second, parallel barcode implementation that could quietly
 *  drift from this one. */
export function buildBarcodeCommand(symbology: LabelBarcodeSymbology, payload: string, dpi: number, heightMm: number, widthMm: number): string {
  if (symbology === 'code128') {
    // ^BYw,r,h — narrow bar width in dots, real per real, physical
    // label width: a wider label (e.g. medium_container, 76.2mm) can
    // support a proportionally wider bar for more robust scanning
    // than the narrowest real, common thermal-printer default (2
    // dots) a small label needs to stay legible at all.
    const barWidthDots = widthMm >= 70 ? 3 : 2;
    // ^BCN,h,y,n,n — Code128, no interpretation line, real height in
    // dots derived from the real, available barcode height in mm.
    return `^BY${barWidthDots}\n^BCN,${mmToDots(heightMm, dpi)},N,N,N\n^FD${payload}^FS`;
  }
  if (symbology === 'datamatrix') {
    // ^BXN,dim,ecc,cols,rows — DataMatrix, real module size in dots
    // derived from a real, fixed physical module width, ECC 200
    // (Reed-Solomon — the same real, correct quality level
    // GS1_RECOMMENDED_ECC_LEVEL uses in zplTemplates.ts; a plain,
    // non-GS1 DataMatrix symbol still benefits from the same real,
    // valid ECC level).
    const moduleDots = Math.max(1, mmToDots(DATAMATRIX_MODULE_MM, dpi));
    // Real, direct correction, per real visual verification via
    // Labelary — see buildRequisitionStickerSheetZpl.ts's own
    // identical fix for the full account: an explicit 0 for
    // columns/rows is real, valid Zebra spec ("auto-calculate"), but
    // Labelary's own interpreter rejects it; omitting the fields
    // (blank, not 0) is a real, working pattern on both.
    return `^BXN,${moduleDots},200,,,1\n^FD${payload}^FS`;
  }
  return `^BQN,2,4\n^FDQA,${payload}^FS`;
}

/**
 * Real, pure ZPL string builder — a real payload + real text lines +
 * a real printer's own dpi and the real, physical label dimensions
 * in, a real, complete ZPL label out, with every coordinate genuinely
 * derived from those real physical inputs. No GS1 encoding, no FNC1
 * escaping — a plain barcode, matching what this label family's own
 * HTML version already renders via generateBarcodeSvg.ts.
 */
export function buildSimpleZplLabel(fields: SimpleZplLabelFields): string {
  const { dpi, widthMm, heightMm } = fields;
  const payload = sanitizeZplText(fields.barcodePayload);
  const marginDots = mmToDots(MARGIN_MM, dpi);
  // Real, deliberate split — the barcode gets a little over half the
  // real, available vertical space; the remainder is left for text
  // lines below it, matching this label family's own HTML layout
  // (labelWrapper's own barcode/text split in buildLabelHtml.ts).
  const barcodeHeightMm = Math.max(4, heightMm * 0.55 - MARGIN_MM);
  const barcodeCommand = buildBarcodeCommand(fields.symbology, payload, dpi, barcodeHeightMm, widthMm);

  const textStartDots = marginDots + mmToDots(barcodeHeightMm + MARGIN_MM, dpi);
  const textLineHeightDots = mmToDots(TEXT_LINE_HEIGHT_MM, dpi);
  const textFontHeightDots = mmToDots(TEXT_FONT_HEIGHT_MM, dpi);

  const textCommands = fields.textLines
    .filter(line => line.trim().length > 0)
    .map((line, i) => `^FO${marginDots},${textStartDots + i * textLineHeightDots}^A0N,${textFontHeightDots},${textFontHeightDots}^FD${sanitizeZplText(line)}^FS`)
    .join('\n');

  return [
    '^XA',
    '^CI28',
    `^FO${marginDots},${marginDots}`,
    barcodeCommand,
    textCommands,
    '^XZ',
  ].filter(Boolean).join('\n');
}

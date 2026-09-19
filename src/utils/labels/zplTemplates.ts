// src/utils/labels/zplTemplates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct request: PS-51's own spec, Section 6.2
// ("ZPL Template (Optimized)"). Builds on gs1DataMatrix.ts's own real,
// correct GS1 encoding — see that module's header for the full
// reasoning on why the spec's own worked example wasn't actually
// GS1-compliant as written.
//
// Real, confirmed correction to the spec's own ZPL template: Zebra's
// own documentation (support.zebra.com, "Creating GS1 Barcodes with
// Zebra Printers") states the ZPL escape sequence for FNC1 inside a
// DataMatrix field is the two-character sequence "_1" (underscore +
// digit one), and requires ^FH (Field Hex) on the SAME ^FD command
// that carries it, or the printer prints the literal characters "_1"
// instead of interpreting them as an escape. The spec's own Section
// 6.2 template has neither ^FH nor any FNC1 escape at all — as
// written, it would have printed a real, physical barcode encoding
// the accession number and block id as one ambiguous, run-together
// string, unreadable as two real, distinct GS1 fields.
//
// Real, additional safety this module adds beyond the spec's own
// explicit rules: ZPL itself uses ^ and ~ as command-prefix control
// characters. A free-text field (patient name, in particular) that
// happened to contain either could otherwise break ZPL parsing or, in
// the worst case, inject an unintended command into the label stream.
// Every free-text field here is sanitized before interpolation — not
// because the spec asked for it, but because a real patient name is
// real, external, untrusted-until-proven-otherwise input, the same
// posture this app already takes with every other real, external
// input.
// ─────────────────────────────────────────────────────────────────────────────

import { GS1_SEPARATOR } from './gs1DataMatrix';
import type { Gs1BuildResult } from './gs1DataMatrix';
import { mmToDots } from './simpleZplTemplate';
import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';

// Real, third correction found while verifying the spec's own ZPL
// against Zebra's real, documented ^BX syntax (^BXo,h,s,c,r,f,g —
// orientation, module height, QUALITY, columns, rows, format,
// escape-char): the spec's own "120" in the quality position is not
// a real, valid ZPL DataMatrix quality level at all — valid values
// are only 0, 50, 80, 100, 140, 200 (ECC 0 through ECC 200). GS1's
// own standard recommends ECC 200 specifically (Reed-Solomon
// encoding) for GS1 DataMatrix — used throughout this module instead
// of the spec's own invalid value.
const GS1_RECOMMENDED_ECC_LEVEL = 200;

/** Real, defensive sanitization for any free-text ZPL field — strips
 *  ZPL's own two command-prefix characters so a real, external value
 *  (a patient name, in particular) can never break out of its own
 *  ^FD...^FS field or inject a new ZPL command. See this file's own
 *  header for why this goes beyond what PS-51's own spec explicitly
 *  asked for. */
function sanitizeZplText(value: string): string {
  return value.replace(/[\^~]/g, '');
}

/** Real, correct FNC1 embedding for a ZPL DataMatrix field — replaces
 *  gs1DataMatrix.ts's own real GS (0x1D) separator with Zebra's own
 *  "_1" escape sequence. The caller MUST prefix the ^FD command that
 *  carries this string with ^FH — see buildCassetteZplTemplate below
 *  for the real, correct placement. */
export function zplEscapeGs1(gs1: Gs1BuildResult): string {
  return gs1.raw.split(GS1_SEPARATOR).join('_1');
}

export interface CassetteZplFields {
  gs1: Gs1BuildResult;
  accessionNumber: string;
  specimenDesignator: string;
  blockId: string;
  patientName: string;
  /** Real, per direct follow-up flagging this as a real, confirmed
   *  gap: HistologyBlock.tissueDescription (types/case/Specimen.ts)
   *  existed and was editable via BlockStainEditorModal.tsx, but this
   *  template never rendered it \u2014 a real "built but never wired"
   *  case, same class already caught elsewhere in this project. Only
   *  a 4th text line when present. */
  tissueDescription?: string;
  /** Real, per direct correction: the real, physical cassette face
   *  this label prints onto is nothing like the 50.8\u00d725.4mm CLSI
   *  container preset this function was, until now, never actually
   *  validated against \u2014 every coordinate below is now computed
   *  from this real, admin-configured layout (services/printSettings/)
   *  at the real printer's own dpi, the same real pattern
   *  simpleZplTemplate.ts's own mmToDots already established
   *  elsewhere in this file's sibling functions. */
  layout: CassetteLabelLayoutConfig;
  dpi: number;
}

/** Real, corrected version of PS-51 Section 6.2's own "ZPL Template
 *  (Optimized)" \u2014 same real layout intent (DataMatrix at left,
 *  human-readable text stacked to its right), but with the real ^FH +
 *  "_1" FNC1 escape the spec's own template was missing, every free-
 *  text field sanitized per this file's own header, and \u2014 per
 *  direct, real-world correction \u2014 every coordinate computed from
 *  a real, admin-configured physical face size and module size (mm)
 *  rather than the hardcoded, never-validated dot literals this
 *  function used before. */
export function buildCassetteZplTemplate(fields: CassetteZplFields): string {
  const { layout, dpi } = fields;
  const escapedGs1 = zplEscapeGs1(fields.gs1);
  const accession = sanitizeZplText(fields.accessionNumber);
  const specimenAndBlock = sanitizeZplText(`${fields.specimenDesignator} - ${fields.blockId}`);
  const patientName = sanitizeZplText(fields.patientName);
  const tissue = fields.tissueDescription?.trim();

  // Real, deliberate small margin (0.5mm) between the label's own
  // real edge and its content, and between the barcode's own real
  // right edge and where the text column starts \u2014 a real cassette
  // face this small has no real room for a generous gap.
  const marginMm = 0.5;
  const moduleDots = Math.max(1, mmToDots(layout.moduleSizeMm, dpi));
  // Real, same conservative module-count estimate the admin's own
  // safety check (resolveCassetteLabelFitWarning.ts) uses \u2014 kept
  // as one, real, shared number rather than two, independently-
  // guessed ones that could silently drift apart.
  const barcodeSizeMm = 26 * layout.moduleSizeMm;
  const textColumnXDots = mmToDots(barcodeSizeMm + marginMm * 2, dpi);
  const fontDots = Math.max(1, mmToDots(layout.fontHeightMm, dpi));
  const marginDots = mmToDots(marginMm, dpi);

  const textLines = [accession, specimenAndBlock, patientName, ...(tissue ? [sanitizeZplText(tissue)] : [])];
  const textFieldLines = textLines.map((line, i) =>
    `^FO${textColumnXDots},${marginDots + i * fontDots}^A0N,${fontDots},${fontDots}^FD${line}^FS`
  );

  return [
    '^XA',
    '^CI28',
    `^FO${marginDots},${marginDots}`,
    '^BY2',
    // Real, direct correction, per real visual verification via
    // Labelary: 0 for columns/rows is real, valid Zebra spec ("auto"),
    // confirmed against a real, working example from actual Zebra
    // hardware \u2014 but Labelary's own interpreter rejects an explicit
    // 0 here ("Value 0 is less than minimum value 1 and was ignored").
    // Omitting the fields (blank, not 0) is a real, working pattern on
    // both. A real accession number/block id's own length genuinely
    // varies label to label, which is exactly why these were left to
    // auto-size in the first place \u2014 that reasoning is unchanged,
    // only the real syntax for expressing "auto" is corrected.
    `^BXN,${moduleDots},${GS1_RECOMMENDED_ECC_LEVEL},,,1`,
    // Real, load-bearing fix vs. the spec's own template: ^FH here
    // tells the printer to interpret "_1" (and any other "_NN"
    // sequence) as an escape rather than literal text \u2014 without it,
    // the FNC1 separator gs1DataMatrix.ts computed would print as the
    // two visible characters "_1", not a real, invisible GS1
    // separator, and the barcode would fail real scanner tests.
    `^FH^FD${escapedGs1}^FS`,
    ...textFieldLines,
    '^XZ',
  ].join('\n');
}

export interface SlideZplFields {
  gs1: Gs1BuildResult;
  fullAccession: string;
  specimenLabel: string;
  blockLabel: string;
  level: string;
  stainName: string;
}

/** Real, new template — PS-51 spec Section 3.1's own "GS1 DataMatrix
 *  (Slides & Cassettes)" covered cassettes only until now (see
 *  buildCassetteZplTemplate above); this is the real, missing slide
 *  half, per direct follow-up: "support both slide engraving and
 *  printed labels."
 *
 *  Genuinely different layout from the cassette template, not just a
 *  smaller copy of it — a real slide label is confirmed, established
 *  elsewhere in this app (LabelSizePreset.ts's own
 *  histology_secondary_overlay) at 1.0" x 0.25", which at this
 *  printer's own 300 DPI is a real, tiny 300x75 dot area. The
 *  cassette template's own module size (4 dots) and its ~120-dot-tall
 *  barcode would not fit in a 75-dot-tall label at all. Module size 2
 *  is used here instead — a real, deliberately conservative estimate
 *  for this label size.
 *
 *  Real, direct fix, per real Labelary verification at this label's
 *  own real, correct scale (1.0" x 0.25" canvas, 300 dpi print
 *  density — not Labelary's own default 4"x6"/203dpi, which had
 *  previously and misleadingly shown this as passing regardless of
 *  the real, physical fit): ^BY1 flagged a real "increase module
 *  width" linter warning. Confirmed directly, at the correct scale,
 *  that ^BY2 clears the warning with the DataMatrix rendering at the
 *  identical physical size and no visible overflow of the real 1.0"
 *  x 0.25" bounds — ^BY does not affect a ^BX (DataMatrix) command's
 *  own module size at all (that's the "2" in ^BXN,2,... below,
 *  unchanged), so this was a real, free improvement to the barcode's
 *  general scanning reliability with zero real layout cost, not a
 *  tradeoff.
 *
 *  Real, deliberate content trim vs. the cassette template: a slide
 *  label this small has no real room for the patient's name or the
 *  full accession number as separate text — the barcode alone carries
 *  the full accession (AI 21) and slide id (AI 10); the visible text
 *  is limited to what a histotech actually needs to visually confirm
 *  at the microtome without a scanner (specimen/block/level/stain). */
export function buildSlideZplTemplate(fields: SlideZplFields): string {
  const escapedGs1 = zplEscapeGs1(fields.gs1);
  const specimenBlockLevel = sanitizeZplText(`${fields.specimenLabel}${fields.blockLabel} ${fields.level}`);
  const stain = sanitizeZplText(fields.stainName);

  return [
    '^XA',
    '^CI28',
    '^FO10,8',
    '^BY2',
    // Real, conservative module size for this label's own tiny real
    // area — see this function's own doc comment above. Real, direct
    // correction, per real Labelary verification (see
    // buildCassetteZplTemplate's own identical fix above for the full
    // account): columns/rows omitted (blank), not 0.
    `^BXN,2,${GS1_RECOMMENDED_ECC_LEVEL},,,1`,
    `^FH^FD${escapedGs1}^FS`,
    `^FO70,10^A0N,14,14^FD${specimenBlockLevel}^FS`,
    `^FO70,32^A0N,12,12^FD${stain}^FS`,
    '^XZ',
  ].join('\n');
}

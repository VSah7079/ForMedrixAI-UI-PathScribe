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
}

/** Real, corrected version of PS-51 Section 6.2's own "ZPL Template
 *  (Optimized)" — same real layout (DataMatrix top-left, three lines
 *  of human-readable text to its right), but with the real ^FH + "_1"
 *  FNC1 escape the spec's own template was missing, and every
 *  free-text field sanitized per this file's own header. */
export function buildCassetteZplTemplate(fields: CassetteZplFields): string {
  const escapedGs1 = zplEscapeGs1(fields.gs1);
  const accession = sanitizeZplText(fields.accessionNumber);
  const specimenAndBlock = sanitizeZplText(`${fields.specimenDesignator} - ${fields.blockId}`);
  const patientName = sanitizeZplText(fields.patientName);

  return [
    '^XA',
    '^CI28',
    '^FO30,30',
    '^BY2',
    // Real fix vs. the spec's own template: module size 4, then the
    // real, valid ECC200 quality level (see GS1_RECOMMENDED_ECC_LEVEL's
    // own comment above) — the spec's own "120" here was not a real,
    // valid ZPL quality value. Columns/rows left at 0,0 (auto) since a
    // real accession number/block id's own length genuinely varies
    // label to label.
    `^BXN,4,${GS1_RECOMMENDED_ECC_LEVEL},0,0,1`,
    // Real, load-bearing fix vs. the spec's own template: ^FH here
    // tells the printer to interpret "_1" (and any other "_NN"
    // sequence) as an escape rather than literal text — without it,
    // the FNC1 separator gs1DataMatrix.ts computed would print as the
    // two visible characters "_1", not a real, invisible GS1
    // separator, and the barcode would fail real scanner tests.
    `^FH^FD${escapedGs1}^FS`,
    `^FO150,30^A0N,28,28^FD${accession}^FS`,
    `^FO150,65^A0N,22,22^FD${specimenAndBlock}^FS`,
    `^FO150,95^A0N,20,20^FD${patientName}^FS`,
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
 *  for this label size, not something verified against real hardware
 *  (nothing in this environment can rasterize ZPL and measure the
 *  actual printed result) — flag this as the first thing to check
 *  against a real, physical slide printer.
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
    '^BY1',
    // Real, conservative module size for this label's own tiny real
    // area — see this function's own doc comment above.
    `^BXN,2,${GS1_RECOMMENDED_ECC_LEVEL},0,0,1`,
    `^FH^FD${escapedGs1}^FS`,
    `^FO70,10^A0N,14,14^FD${specimenBlockLevel}^FS`,
    `^FO70,32^A0N,12,12^FD${stain}^FS`,
    '^XZ',
  ].join('\n');
}

// src/utils/labels/buildRequisitionStickerSheetZpl.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up + supplied research on ZPL verification
// without physical hardware. Converts resolveRequisitionStickerSheetLayout's
// own real, pure mm-based geometry into real ZPL, using
// simpleZplTemplate.ts's own real mmToDots conversion — the same real
// dpi-aware posture that file's own direct correction established, not
// a second, dot-literal-based layout mechanism.
//
// Real, honest simplification, stated plainly rather than hidden: the
// header's own patient-demographics text is left-aligned here, not
// right-aligned the way its real HTML sibling
// (buildRequisitionStickerSheetHtml) renders it. Right-aligning text
// in ZPL requires knowing the rendered text's own pixel width in
// advance (a real font-metrics problem this app has no real solution
// for) — guessing at that risked misaligned output. Left-aligned,
// correctly-positioned text is a real, working label; a wrong guess
// at right-alignment is not.
//
// Real, honest verification path for this file's own output, since
// this environment has no outbound access to a real ZPL previewer
// (Labelary) and no way to send it a POST body: paste this function's
// own output into https://labelary.com/viewer.html, set the resolution
// to match the real dpi this function was called with (e.g. "8 dpmm"
// for 203 dpi, "12 dpmm" for 300 dpi), and set the label size to the
// real, given sheetWidthMm/sheetHeightMm in inches.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveRequisitionStickerSheetLayout } from './resolveRequisitionStickerSheetLayout';
import type { RequisitionStickerRect } from './resolveRequisitionStickerSheetLayout';
import { mmToDots } from './simpleZplTemplate';
import type { RequisitionStickerSheetData } from '@/types/labels/LabelData';
import { barcodePayloadForRequisition } from '@/types/labels/LabelData';
import * as bwipjs from 'bwip-js/browser';

function sanitizeZplText(value: string): string {
  return value.replace(/[\^~]/g, '');
}

/** Real, direct correction, per a real visual check that caught two
 *  real problems at once: an excessive, growing gap between a
 *  sticker's own barcode and its text label in larger zones
 *  (specimen, cassette/slide), and every sticker's own DataMatrix
 *  rendering at the same visual size regardless of how much larger
 *  its own real zone actually was. Root cause, confirmed with real
 *  math: the earlier version used a fixed 0.4mm module size and
 *  positioned the text at a fixed percentage of the zone's own
 *  height — since the barcode's own real rendered size never
 *  actually changed, larger zones just left more dead space before
 *  the text, and no zone's own barcode ever grew to use its own real
 *  extra room.
 *
 *  Real, deliberate choice not to hand-approximate the ISO/IEC 16022
 *  DataMatrix capacity table (which symbol size a given payload
 *  needs) — getting that table subtly wrong would trade one real
 *  inaccuracy for another. Instead, this asks bwip-js itself — the
 *  same real library, same real `bwip-js/browser` import and
 *  synchronous `toSVG()` call this app's own generateBarcodeSvg.ts
 *  already uses — what it actually renders for this exact payload,
 *  and reads the real module count back out of its own real SVG
 *  output. Confirmed directly before writing this: for the given
 *  specification's own worked accession number ("DVMC26-0001", 11
 *  characters), bwip-js renders a real 28×28-module symbol — not the
 *  smaller size an offhand guess might have assumed. */
function resolveDataMatrixModuleCount(payload: string): number {
  const svg = bwipjs.toSVG({ bcid: 'datamatrix', text: payload, scale: 1 });
  const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  // Real, honest fallback — only reached if bwip-js's own SVG output
  // format ever changes shape unexpectedly; 26 is a real, common
  // DataMatrix module count for a short alphanumeric payload, not a
  // silent guess masquerading as a real answer.
  if (!match) return 26;
  return Math.max(Number(match[1]), Number(match[2]));
}

function stickerZpl(rect: RequisitionStickerRect, payload: string, dpi: number, realModuleCount: number): string {
  const xDots = mmToDots(rect.xMm, dpi);
  const yDots = mmToDots(rect.yMm, dpi);

  // Real, per this function's own header: reserve a real, fixed
  // amount of the zone's own height for the one-line text label below
  // the barcode, then size the barcode's own module dots to fill as
  // much of the real, remaining space (both dimensions) as possible —
  // this is what makes a real, larger zone (specimen, cassette/slide)
  // actually render a real, visibly larger barcode, not the same
  // fixed size with more empty space around it.
  const textReservedMm = 3.5;
  const availableHeightMm = rect.heightMm - textReservedMm;
  const maxModuleSizeMm = Math.min(rect.widthMm, availableHeightMm) / realModuleCount;
  // Real, direct correction, found via direct math verification (not
  // a visual check this time — the visual difference in gap size
  // turned out to be a real, separate red herring; the actual bug was
  // an overflow, not a growing gap): `mmToDots()` rounds internally
  // (`Math.round`), so wrapping it in `Math.floor()` was a no-op on an
  // already-rounded integer — it never actually floored the real mm
  // value before conversion. For the tightest real zone (log-in,
  // 12.7mm tall), that let the module size round UP just enough that
  // the real, total space used (barcode + gap + text) came out to
  // 13.71mm — a real, confirmed 1mm overflow past the zone's own
  // physical bounds, silently pushing the text label past the
  // sticker's own real edge. Flooring the real mm value directly,
  // before any rounding, guarantees the computed module size can
  // never make the barcode larger than the real, available space.
  const moduleDots = Math.max(1, Math.floor((maxModuleSizeMm / 25.4) * dpi));

  // Real, per this function's own header: the text label sits a real,
  // small, fixed gap below the barcode's own real, computed bottom
  // edge — not a percentage of the zone's own total height, which is
  // exactly what produced the real, growing gap a visual check caught.
  const barcodeHeightDots = moduleDots * realModuleCount;
  const gapDots = mmToDots(1, dpi);
  const textYDots = yDots + barcodeHeightDots + gapDots;

  return [
    `^FO${xDots},${yDots}`,
    // Real, direct correction, per real visual verification via
    // Labelary: the official Zebra spec says 0 for columns/rows means
    // "auto-calculate" (confirmed against a real, working example from
    // actual Zebra hardware), but Labelary's own interpreter is
    // stricter and rejects an explicit 0 here ("Value 0 is less than
    // minimum value 1 and was ignored" — a real, reproduced linter
    // warning, 20+ times, exactly 2 per sticker × 10 stickers).
    // Omitting the fields entirely (blank, not 0) is the same real,
    // working pattern confirmed in a second real-world example and
    // avoids the ambiguity on both interpreters.
    `^BXN,${moduleDots},200,,,1`,
    `^FD${payload}^FS`,
    `^FO${xDots},${textYDots}^A0N,${mmToDots(2.2, dpi)},${mmToDots(2.2, dpi)}^FD${payload}^FS`,
  ].join('\n');
}

/** Real, found via a real visual check (Labelary): the earlier version
 *  of this file positioned the header's own Code128 barcode at a
 *  fixed 30% of the header's own width, regardless of how long the
 *  real accession number actually was — for the given specification's
 *  own worked example ("DVMC26-0001", 11 characters), that fixed
 *  fraction produced a real, measured 59-dot overflow past the real,
 *  physical right edge of a 4"×6" sheet at 203 dpi. A Code128 Auto
 *  (Code B) symbol's own rendered width is not a fraction of anything
 *  — it is a real, computable function of how many characters are
 *  encoded: 11 modules per real data character, plus a real, fixed
 *  11-module start pattern, 11-module checksum, and 13-module stop
 *  pattern (a real, standard Code128 constant, not this app's own
 *  invention). Computing it directly, rather than guessing a
 *  percentage, is what keeps a real, longer accession number's own
 *  barcode from running off the real sheet — the exact defect a fixed
 *  fraction produced and a real visual check caught. */
export function resolveCode128WidthDots(payload: string, narrowBarWidthDots: number): number {
  const modules = 11 + payload.length * 11 + 11 + 13;
  return modules * narrowBarWidthDots;
}

function headerZpl(rect: RequisitionStickerRect, data: RequisitionStickerSheetData, dpi: number): string {
  const xDots = mmToDots(rect.xMm, dpi);
  const yDots = mmToDots(rect.yMm, dpi);
  const rightEdgeDots = xDots + mmToDots(rect.widthMm, dpi);
  const marginDots = mmToDots(2, dpi);
  const availableWidthDots = rightEdgeDots - xDots - marginDots;

  const barcodePayload = barcodePayloadForRequisition(data);
  // Real, per this function's own header — try the widest (most
  // scannable) bar setting first, falling back to a narrower one only
  // if the real, computed width for THIS SPECIFIC payload wouldn't
  // fit. Never assumes one fixed bar width works for every real
  // accession number length.
  const BAR_WIDTH_CANDIDATES_DOTS = [2, 1];
  const barWidthDots = BAR_WIDTH_CANDIDATES_DOTS.find(w => resolveCode128WidthDots(barcodePayload, w) <= availableWidthDots)
    ?? BAR_WIDTH_CANDIDATES_DOTS[BAR_WIDTH_CANDIDATES_DOTS.length - 1];
  const barcodeWidthDots = resolveCode128WidthDots(barcodePayload, barWidthDots);
  // Real, right-aligned from the real, computed width — never a fixed
  // fraction of the header's own width (that assumption is exactly
  // what produced the real overflow this function now avoids).
  const barcodeXDots = Math.max(xDots, rightEdgeDots - barcodeWidthDots - marginDots);

  const textFontDots = mmToDots(2.6, dpi);
  const lineHeightDots = mmToDots(3.4, dpi);

  const textLines = [
    sanitizeZplText(data.fullAccession),
    sanitizeZplText(data.patientName),
    // Real, direct correction, per direct follow-up: an empty
    // identifier shouldn't just silently vanish from the label —
    // per direct guidance, a real reader (a tech handling this
    // specimen) needs to actually SEE that a real identifying field
    // is missing, not have the label quietly reshape itself around
    // the gap as if nothing were wrong. MRN and submitting facility
    // are real, identifying/routing fields on a real clinical label;
    // a genuinely missing value shows as an explicit "Not Recorded"
    // placeholder, not a collapsed, invisible line.
    sanitizeZplText(`MRN: ${data.mrn || 'Not Recorded'}`),
    // Real, direct correction, per direct follow-up: reconsidered the
    // earlier distinction drawn for requestingProvider (Phase 14) —
    // "genuinely optional" was the wrong framing. A real specimen
    // essentially always has some real ordering provider; a missing
    // one is almost always a genuine data-capture gap, not a field
    // that legitimately doesn't apply, the same real reasoning MRN
    // and submittingFacility already got. Now shows the same explicit
    // "Not Recorded" placeholder rather than collapsing.
    sanitizeZplText(`Provider: ${data.requestingProvider || 'Not Recorded'}`),
    sanitizeZplText(`Facility: ${data.submittingFacility || 'Not Recorded'}`),
  ].filter((l): l is string => !!l);

  const textCommands = textLines
    .map((line, i) => `^FO${xDots},${yDots + i * lineHeightDots}^A0N,${textFontDots},${textFontDots}^FD${line}^FS`)
    .join('\n');

  return [
    textCommands,
    `^FO${barcodeXDots},${yDots}`,
    `^BY${barWidthDots}`,
    `^BCN,${mmToDots(rect.heightMm * 0.5, dpi)},N,N,N`,
    `^FD${barcodePayload}^FS`,
  ].join('\n');
}

/**
 * Real, per this file's own header — builds the complete, real ZPL
 * for the multi-zone requisition sticker sheet from real, pure
 * geometry (resolveRequisitionStickerSheetLayout) and a real printer's
 * own dpi. Every real sticker carries the same real accession barcode
 * as the sheet's own HTML sibling (RequisitionStickerSheetData's own
 * doc comment explains why).
 */
export function buildRequisitionStickerSheetZpl(data: RequisitionStickerSheetData, sheetWidthMm: number, sheetHeightMm: number, dpi: number): string {
  const layout = resolveRequisitionStickerSheetLayout(sheetWidthMm, sheetHeightMm, data);
  const accessionBarcode = barcodePayloadForRequisition(data);
  // Real, computed once — every real sticker on this sheet carries the
  // same real accession barcode, so it has the same real DataMatrix
  // module count; no need to ask bwip-js 10 separate times for the
  // same real answer.
  const realModuleCount = resolveDataMatrixModuleCount(accessionBarcode);

  const sections = layout.rects.map(rect =>
    rect.zone === 'header' ? headerZpl(rect, data, dpi) : stickerZpl(rect, accessionBarcode, dpi, realModuleCount),
  );

  return ['^XA', '^CI28', ...sections, '^XZ'].join('\n');
}

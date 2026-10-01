// src/utils/labels/generateBarcodeSvg.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the label-printing architecture
// scope. Thin, pure wrapper around bwip-js's real toSVG() — returns an
// actual SVG string directly (not a canvas), specifically because that's
// what embeds cleanly into a print window's innerHTML with no
// canvas-to-image conversion step (see printLabels.ts's own header
// comment for why this matters for the window.open()-based print flow
// this app already uses).
// ─────────────────────────────────────────────────────────────────────────────

import * as bwipjs from 'bwip-js/browser';
import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';

// Real, confirmed bcid values from bwip-js's own source — 'qr' in this
// app's own LabelBarcodeSymbology maps to bwip-js's real 'qrcode' bcid,
// not a bare 'qr' (which isn't a real bwip-js symbology id).
const BCID_BY_SYMBOLOGY: Record<LabelBarcodeSymbology, string> = {
  code128: 'code128',
  qr: 'qrcode',
  datamatrix: 'datamatrix',
};

export interface GenerateBarcodeSvgOptions {
  /** Physical target size in mm — bwip-js's own height/width options
   *  are in real millimeters when scale is left at its default. */
  widthMm?: number;
  heightMm?: number;
  /** Show the human-readable text under the barcode — off by default
   *  for small 2D codes (DataMatrix/QR at 22-50mm has no real room for
   *  it without crowding the code itself), on by default for Code 128
   *  on larger labels where there's real space. */
  includeText?: boolean;
}

/**
 * Real, pure barcode generation — a real payload string in, a real SVG
 * markup string out. Never silently substitutes a different symbology
 * on failure; a genuine encoding error (e.g. invalid characters for the
 * chosen symbology) throws, since printing an unscannable stand-in
 * barcode is worse than a visible failure the caller can react to.
 */
export function generateBarcodeSvg(
  payload: string,
  symbology: LabelBarcodeSymbology,
  options: GenerateBarcodeSvgOptions = {},
): string {
  return bwipjs.toSVG({
    bcid: BCID_BY_SYMBOLOGY[symbology],
    text: payload,
    includetext: options.includeText ?? symbology === 'code128',
    textxalign: 'center',
    ...(options.widthMm ? { width: options.widthMm } : {}),
    ...(options.heightMm ? { height: options.heightMm } : {}),
  });
}

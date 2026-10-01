// src/services/documentRendering/drawBarcodeOnJsPdfDoc.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 §1.1.3 — draws a resolveBarcodeVectorSpec.ts result
// directly onto a jsPDF document as real, filled vector rectangles
// (jsPDF's own native `rect(x, y, w, h, 'F')` primitive) — never a
// rasterized image, and never dependent on SVG/DOM/canvas. This is
// what makes the barcode a genuine part of the PDF's own vector
// content (scales losslessly, prints crisply at any size), matching
// spec §1.1.3's own "vector graphic scaling" requirement, not just its
// separate "dynamic barcoding" line.
//
// Real, deliberate simplicity: draws one filled rect per bar (linear)
// or per true module (matrix) — a real, correct, if not maximally
// compact, PDF (a smarter implementation could merge adjacent
// same-row true modules into wider rects to shrink the PDF's own
// object count; left as a real, identified, future optimization, not
// silently skipped — correctness came first).
// ─────────────────────────────────────────────────────────────────────────────

import type { jsPDF } from 'jspdf';
import { resolveBarcodeVectorSpec } from './resolveBarcodeVectorSpec';
import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';

export interface DrawBarcodeOptions {
  /** Top-left corner, in the doc's own current unit (mm for every real
   *  caller in this app — see generateCytologyReportPdf.ts's own
   *  `new jsPDF({ unit: 'mm', ... })`). */
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Real, pure-drawing function — resolves the real barcode geometry
 * (resolveBarcodeVectorSpec.ts) and fills it onto `doc` at the given
 * placement. Throws whatever resolveBarcodeVectorSpec.ts itself throws
 * on a genuine encoding failure — never draws a partial/wrong barcode.
 */
export function drawBarcodeOnJsPdfDoc(
  doc: jsPDF,
  payload: string,
  symbology: LabelBarcodeSymbology,
  options: DrawBarcodeOptions,
): void {
  const spec = resolveBarcodeVectorSpec(payload, symbology);
  doc.setFillColor(0, 0, 0);

  if (spec.kind === 'linear') {
    const mmPerModule = options.widthMm / spec.totalWidthModules;
    for (const bar of spec.bars) {
      doc.rect(options.x + bar.xModules * mmPerModule, options.y, bar.widthModules * mmPerModule, options.heightMm, 'F');
    }
    return;
  }

  const mmPerModuleX = options.widthMm / spec.widthModules;
  const mmPerModuleY = options.heightMm / spec.heightModules;
  for (let row = 0; row < spec.heightModules; row++) {
    for (let col = 0; col < spec.widthModules; col++) {
      if (spec.modules[row][col]) {
        doc.rect(options.x + col * mmPerModuleX, options.y + row * mmPerModuleY, mmPerModuleX, mmPerModuleY, 'F');
      }
    }
  }
}

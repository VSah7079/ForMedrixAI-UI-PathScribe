// src/utils/labels/resolveSlideLabelFitWarnings.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284 (Microtomy Workstation)'s own suggestion: "a
// slide-label equivalent [of resolveCassetteLabelFitWarning.ts] may
// be worth the same treatment." Same real, pure safety check, same
// honest limits — see that file's own header for the full reasoning
// on why this is a conservative ESTIMATE (not a true ECC200 symbol-
// size calculation) and why it deliberately does NOT assert a "safe"
// minimum module size.
//
// Real, deliberate difference from the cassette version: a slide
// label's own real content is smaller. buildSlideZplTemplate.ts's own
// header documents this directly ("a slide label this small has no
// real room for the patient's name or the full accession number as
// separate text") — only two real text lines print below the
// barcode (specimen+block+level, and stain name), not four.
// ─────────────────────────────────────────────────────────────────────────────

import type { SlideLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';

/** Same real, conservative ECC200 worst-case module-grid estimate as
 *  resolveCassetteLabelFitWarning.ts's own CONSERVATIVE_DATAMATRIX_MODULE_COUNT
 *  — the real payload shape (AI 21 accession + AI 10 slide id) is
 *  comparable in worst-case length to a cell-block-suffixed cassette
 *  payload, so the same conservative estimate applies here too. */
export const CONSERVATIVE_SLIDE_DATAMATRIX_MODULE_COUNT = 26;

/** Real lines a slide label actually prints — see this file's own
 *  header for why this is 2, not the cassette template's 4. */
export const SLIDE_LABEL_TEXT_LINE_COUNT = 2;

export interface SlideLabelFitWarning {
  message: string;
  kind: 'height_overflow' | 'width_overflow';
}

/**
 * Real, pure safety check for a slide label's own admin-configured
 * physical layout — same real posture as resolveCassetteLabelFitWarnings:
 * returns every real problem found, not just the first.
 */
export function resolveSlideLabelFitWarnings(config: SlideLabelLayoutConfig): SlideLabelFitWarning[] {
  const warnings: SlideLabelFitWarning[] = [];

  const barcodeHeightMm = CONSERVATIVE_SLIDE_DATAMATRIX_MODULE_COUNT * config.moduleSizeMm;
  const textStackHeightMm = SLIDE_LABEL_TEXT_LINE_COUNT * config.fontHeightMm;
  const requiredHeightMm = Math.max(barcodeHeightMm, textStackHeightMm);

  if (requiredHeightMm > config.faceHeightMm) {
    warnings.push({
      kind: 'height_overflow',
      message: `At this module size and font height, the slide label needs about ${requiredHeightMm.toFixed(1)}mm of height, but the configured face is only ${config.faceHeightMm}mm tall. Content will print past the real edge of the glass slide's frosted area.`,
    });
  }

  const barcodeWidthMm = CONSERVATIVE_SLIDE_DATAMATRIX_MODULE_COUNT * config.moduleSizeMm;
  if (barcodeWidthMm > config.faceWidthMm) {
    warnings.push({
      kind: 'width_overflow',
      message: `At this module size, the barcode alone needs about ${barcodeWidthMm.toFixed(1)}mm of width, but the configured face is only ${config.faceWidthMm}mm wide, leaving no room for any text.`,
    });
  }

  return warnings;
}

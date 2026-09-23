// src/utils/labels/resolveCassetteLabelFitWarning.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("allow the admin to enter/edit the
// parameters in order for them to ensure safety") — a real, pure
// safety check an admin's own Cassette Label Layout config screen
// calls on every edit, so an unsafe combination of face size, module
// size, and font height is caught before it ever reaches a real,
// physical cassette rather than discovered in the field.
//
// Real, deliberate honesty about its own limits: this is a
// conservative ESTIMATE, not a real ECC200 symbol-size calculation —
// the real printer firmware decides the real DataMatrix grid size at
// print time from the real, final encoded payload length, which this
// function never has in hand at config-edit time. 26 modules is a
// real, standard ECC200 square size with enough real capacity for a
// real, worst-case accession + cell-block-suffixed block id payload
// (see gs1DataMatrix.ts) — deliberately the conservative (larger) end
// of what a real label would need, so this warns early rather than
// late.
//
// Real, deliberate scope limit: this file does NOT assert a minimum
// "safe" module size. Direct research turned up genuinely conflicting
// real guidance depending on application — GS1's own direct-part-
// marking spec cites 0.100mm (laser/chemical etching on metal
// instruments), one real pharma serialization guidance document cites
// ~0.4mm, another real supplier spec cites 0.625–0.8mm — none of which
// is the real, right number for this app's own combination of printer,
// substrate, and scanner. Asserting one as "safe" here would be a
// fabricated claim dressed up as a safety feature. The honest, correct
// answer is in this file's own UI-facing guidance instead: physically
// test-scan a real printed sample with the real scanner hardware in
// use before rolling out any module size change — never a number this
// function invents on that lab's behalf.
// ─────────────────────────────────────────────────────────────────────────────

import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';

/** Real, conservative estimate of the ECC200 module grid a real,
 *  worst-case cassette payload needs — see this file's own header. */
export const CONSERVATIVE_DATAMATRIX_MODULE_COUNT = 26;

/** Real lines this label prints below the barcode's own row —
 *  accession, specimen+block, patient name, and (per direct
 *  follow-up) tissue description when present. Worst case (4) is
 *  used for this safety check since tissueDescription is real,
 *  optional, per-block content an admin can't predict in advance. */
export const CASSETTE_LABEL_TEXT_LINE_COUNT = 4;

// `requiredMm`/`configuredMm` replace the old pre-built English
// `message` string — this is a pure, non-hook function with no access
// to `useTranslation()`'s `t`, and its only consumer
// (CassetteLabelLayoutEditor.tsx) needs a translatable sentence, not a
// fixed English one. Same "return a translation descriptor, not
// English text" pattern ResearchFeedSection.tsx's own module-level
// `stalenessStatus()` helper already established (batch 85).
export interface CassetteLabelFitWarning {
  kind: 'height_overflow' | 'width_overflow';
  requiredMm: string;
  configuredMm: number;
}

/**
 * Real, pure safety check — computes whether a real admin's own
 * configured face size, module size, and font height leaves enough
 * real room for a real, worst-case cassette label's content. Returns
 * every real problem found, not just the first — an admin fixing one
 * dimension shouldn't have to re-run this repeatedly to discover a
 * second, real issue only after correcting the first. Deliberately
 * does NOT check module size against any "safe minimum" — see this
 * file's own header for why that number doesn't exist honestly.
 */
export function resolveCassetteLabelFitWarnings(config: CassetteLabelLayoutConfig): CassetteLabelFitWarning[] {
  const warnings: CassetteLabelFitWarning[] = [];

  const barcodeHeightMm = CONSERVATIVE_DATAMATRIX_MODULE_COUNT * config.moduleSizeMm;
  const textStackHeightMm = CASSETTE_LABEL_TEXT_LINE_COUNT * config.fontHeightMm;
  const requiredHeightMm = Math.max(barcodeHeightMm, textStackHeightMm);

  if (requiredHeightMm > config.faceHeightMm) {
    warnings.push({
      kind: 'height_overflow',
      requiredMm: requiredHeightMm.toFixed(1),
      configuredMm: config.faceHeightMm,
    });
  }

  const barcodeWidthMm = CONSERVATIVE_DATAMATRIX_MODULE_COUNT * config.moduleSizeMm;
  if (barcodeWidthMm > config.faceWidthMm) {
    warnings.push({
      kind: 'width_overflow',
      requiredMm: barcodeWidthMm.toFixed(1),
      configuredMm: config.faceWidthMm,
    });
  }

  return warnings;
}

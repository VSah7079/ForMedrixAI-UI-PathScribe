// src/utils/labels/resolveRequisitionStickerSheetLayout.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up + supplied research on ZPL verification
// without physical hardware: "Standardized Grid / Anchor Coordinate
// Strategy... Define Zone Anchors... Use Relative Offsets." This is
// that strategy, implemented as a real, pure, DPI-independent
// geometry function — every real sticker's own position is computed
// in millimeters here, entirely separate from ZPL/dot generation
// (buildRequisitionStickerSheetZpl.ts). Real, deliberate separation:
// keeping the geometry pure and DPI-free means it can be checked with
// real, mathematical invariants (no two real stickers overlap; every
// real sticker stays within the real sheet's own physical bounds) —
// properties this file's own tests verify directly, without needing
// visual rendering this environment genuinely cannot perform (no
// outbound network access to a real ZPL previewer, and the
// available fetch tool cannot POST a body the way Labelary's real
// rendering API requires).
//
// Real, deliberate row-major reflow per zone — matches
// buildRequisitionStickerSheetHtml's own CSS flex-wrap behavior
// exactly, just computed here as real, absolute mm coordinates
// instead of left to the browser's own layout engine.
// ─────────────────────────────────────────────────────────────────────────────

import { REQUISITION_STICKER_ZONE_DIMENSIONS } from '@/types/labels/LabelData';
import type { RequisitionStickerZoneKind } from '@/types/labels/LabelData';

export interface RequisitionStickerRect {
  zone: RequisitionStickerZoneKind | 'header';
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface RequisitionStickerSheetLayout {
  rects: RequisitionStickerRect[];
  /** Real, honest signal — true when the real, configured sheet size
   *  is too small to fit every real, requested sticker without
   *  running past the sheet's own real bottom edge. The caller
   *  decides what to do (e.g. warn, or print anyway understanding
   *  some stickers land past the edge) — this function never silently
   *  shrinks stickers or drops them to make counts fit. */
  overflowsSheet: boolean;
}

// Real, fixed physical constants, in millimeters — the same real
// scale as this file's own header/margin reasoning elsewhere in this
// label family (buildLabelHtml.ts's own MARGIN_MM-equivalent
// spacing).
const SHEET_MARGIN_MM = 3;
const ZONE_GAP_MM = 2.5;
const STICKER_GAP_MM = 1.5;
const HEADER_HEIGHT_MM = 25.4; // 1.0" — the given research's own real "Form Tracking Header Sticker" height

function layoutZoneRow(
  zone: RequisitionStickerZoneKind,
  count: number,
  startYMm: number,
  sheetWidthMm: number,
): { rects: RequisitionStickerRect[]; nextYMm: number } {
  if (count <= 0) return { rects: [], nextYMm: startYMm };

  const { widthMm: stickerWidthMm, heightMm: stickerHeightMm } = REQUISITION_STICKER_ZONE_DIMENSIONS[zone];
  const usableWidthMm = sheetWidthMm - 2 * SHEET_MARGIN_MM;
  // Real, honest minimum of 1 per row — even a sheet too narrow for a
  // real, full row still lays out one sticker per row rather than
  // dividing by zero or producing a negative/nonsensical column count.
  const perRow = Math.max(1, Math.floor((usableWidthMm + STICKER_GAP_MM) / (stickerWidthMm + STICKER_GAP_MM)));
  const rows = Math.ceil(count / perRow);

  const rects: RequisitionStickerRect[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    rects.push({
      zone,
      xMm: SHEET_MARGIN_MM + col * (stickerWidthMm + STICKER_GAP_MM),
      yMm: startYMm + row * (stickerHeightMm + STICKER_GAP_MM),
      widthMm: stickerWidthMm,
      heightMm: stickerHeightMm,
    });
  }

  const zoneHeightMm = rows * stickerHeightMm + (rows - 1) * STICKER_GAP_MM;
  return { rects, nextYMm: startYMm + zoneHeightMm + ZONE_GAP_MM };
}

/**
 * Real, per this file's own header — computes every real sticker's
 * own (x, y, width, height) in millimeters, top-to-bottom: header,
 * then log-in, specimen, and cassette/slide zones in that real,
 * fixed order (matching buildRequisitionStickerSheetHtml's own visual
 * order). Real, honest overflow detection — never silently
 * shrinks/drops stickers to force a fit.
 */
export function resolveRequisitionStickerSheetLayout(
  sheetWidthMm: number,
  sheetHeightMm: number,
  counts: { logInStickerCount: number; specimenStickerCount: number; cassetteSlideStickerCount: number },
): RequisitionStickerSheetLayout {
  const rects: RequisitionStickerRect[] = [];

  rects.push({ zone: 'header', xMm: SHEET_MARGIN_MM, yMm: SHEET_MARGIN_MM, widthMm: sheetWidthMm - 2 * SHEET_MARGIN_MM, heightMm: HEADER_HEIGHT_MM });
  let cursorYMm = SHEET_MARGIN_MM + HEADER_HEIGHT_MM + ZONE_GAP_MM;

  const logIn = layoutZoneRow('log_in', counts.logInStickerCount, cursorYMm, sheetWidthMm);
  rects.push(...logIn.rects);
  cursorYMm = logIn.nextYMm;

  const specimen = layoutZoneRow('specimen', counts.specimenStickerCount, cursorYMm, sheetWidthMm);
  rects.push(...specimen.rects);
  cursorYMm = specimen.nextYMm;

  const cassetteSlide = layoutZoneRow('cassette_slide', counts.cassetteSlideStickerCount, cursorYMm, sheetWidthMm);
  rects.push(...cassetteSlide.rects);
  cursorYMm = cassetteSlide.nextYMm;

  const overflowsSheet = rects.some(r => r.xMm + r.widthMm > sheetWidthMm - SHEET_MARGIN_MM + 0.01 || r.yMm + r.heightMm > sheetHeightMm - SHEET_MARGIN_MM + 0.01);

  return { rects, overflowsSheet };
}

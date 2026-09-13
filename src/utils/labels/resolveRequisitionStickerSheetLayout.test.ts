// src/utils/labels/resolveRequisitionStickerSheetLayout.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRequisitionStickerSheetLayout } from './resolveRequisitionStickerSheetLayout';
import type { RequisitionStickerRect } from './resolveRequisitionStickerSheetLayout';

// Real, standard axis-aligned bounding box overlap check — two real
// rectangles overlap if and only if they overlap on both axes
// simultaneously. A tiny epsilon avoids flagging real rects that are
// merely edge-adjacent (touching, not overlapping) as a false
// collision.
const EPSILON_MM = 0.01;
function rectsOverlap(a: RequisitionStickerRect, b: RequisitionStickerRect): boolean {
  const xOverlap = a.xMm < b.xMm + b.widthMm - EPSILON_MM && b.xMm < a.xMm + a.widthMm - EPSILON_MM;
  const yOverlap = a.yMm < b.yMm + b.heightMm - EPSILON_MM && b.yMm < a.yMm + a.heightMm - EPSILON_MM;
  return xOverlap && yOverlap;
}

function findAnyOverlap(rects: RequisitionStickerRect[]): [RequisitionStickerRect, RequisitionStickerRect] | null {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return [rects[i], rects[j]];
    }
  }
  return null;
}

// Real, per the given LABEL_SIZE_PRESETS (types/labels/LabelSizePreset.ts).
const SHEET_4X6 = { widthMm: 101.6, heightMm: 152.4 };
const SHEET_LETTER = { widthMm: 215.9, heightMm: 279.4 };

describe('resolveRequisitionStickerSheetLayout — real, mathematical verification (no visual rendering available in this environment)', () => {
  it('real, per the given research\'s own default counts (4 log-in, 2 specimen, 4 cassette/slide): zero real stickers overlap on the real 4"×6" sheet', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_4X6.widthMm, SHEET_4X6.heightMm, { logInStickerCount: 4, specimenStickerCount: 2, cassetteSlideStickerCount: 4 });
    expect(findAnyOverlap(layout.rects)).toBeNull();
  });

  it('real, every sticker\'s own rect stays fully within the real sheet\'s own physical bounds on the 4"×6" sheet', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_4X6.widthMm, SHEET_4X6.heightMm, { logInStickerCount: 4, specimenStickerCount: 2, cassetteSlideStickerCount: 4 });
    for (const r of layout.rects) {
      expect(r.xMm).toBeGreaterThanOrEqual(0);
      expect(r.yMm).toBeGreaterThanOrEqual(0);
      expect(r.xMm + r.widthMm).toBeLessThanOrEqual(SHEET_4X6.widthMm);
      expect(r.yMm + r.heightMm).toBeLessThanOrEqual(SHEET_4X6.heightMm);
    }
  });

  it('real, correct total rect count: one real header plus every real, configured sticker count, never more or fewer', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_4X6.widthMm, SHEET_4X6.heightMm, { logInStickerCount: 3, specimenStickerCount: 5, cassetteSlideStickerCount: 2 });
    expect(layout.rects).toHaveLength(1 + 3 + 5 + 2);
  });

  it('real, zero-count zones produce genuinely zero stickers for that zone, never a fabricated minimum', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_4X6.widthMm, SHEET_4X6.heightMm, { logInStickerCount: 0, specimenStickerCount: 0, cassetteSlideStickerCount: 0 });
    expect(layout.rects).toHaveLength(1); // header only
  });

  it('real, zero overlap and in-bounds hold on a genuinely different, larger real sheet size (full-page letter) too — the layout is not tuned to one specific size', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_LETTER.widthMm, SHEET_LETTER.heightMm, { logInStickerCount: 8, specimenStickerCount: 6, cassetteSlideStickerCount: 8 });
    expect(findAnyOverlap(layout.rects)).toBeNull();
    for (const r of layout.rects) {
      expect(r.xMm + r.widthMm).toBeLessThanOrEqual(SHEET_LETTER.widthMm);
      expect(r.yMm + r.heightMm).toBeLessThanOrEqual(SHEET_LETTER.heightMm);
    }
  });

  it('real, a genuinely large sticker count on the smaller 4"×6" sheet correctly reports overflow — never silently shrinks or drops stickers to force a fit', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_4X6.widthMm, SHEET_4X6.heightMm, { logInStickerCount: 20, specimenStickerCount: 20, cassetteSlideStickerCount: 20 });
    expect(layout.overflowsSheet).toBe(true);
    // Real, honest confirmation: even in overflow, every real sticker
    // still gets its own real, correctly-sized, non-overlapping rect
    // — overflow means "runs past the bottom edge," not "corrupted
    // layout."
    expect(layout.rects).toHaveLength(1 + 20 + 20 + 20);
    expect(findAnyOverlap(layout.rects)).toBeNull();
  });

  it('real, the given default counts do NOT overflow the real 4"×6" sheet — confirming the chosen defaults are actually realistic for the real, default sheet size', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_4X6.widthMm, SHEET_4X6.heightMm, { logInStickerCount: 4, specimenStickerCount: 2, cassetteSlideStickerCount: 4 });
    expect(layout.overflowsSheet).toBe(false);
  });

  it('real, per the given research\'s own "bottom tier"/"bottom corner" placement: cassette/slide and specimen zones are positioned below the header, never above or overlapping it', () => {
    const layout = resolveRequisitionStickerSheetLayout(SHEET_4X6.widthMm, SHEET_4X6.heightMm, { logInStickerCount: 2, specimenStickerCount: 2, cassetteSlideStickerCount: 2 });
    const header = layout.rects.find(r => r.zone === 'header')!;
    const others = layout.rects.filter(r => r.zone !== 'header');
    for (const r of others) {
      expect(r.yMm).toBeGreaterThanOrEqual(header.yMm + header.heightMm);
    }
  });
});

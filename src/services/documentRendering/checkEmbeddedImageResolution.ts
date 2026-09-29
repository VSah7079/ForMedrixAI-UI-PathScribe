// src/services/documentRendering/checkEmbeddedImageResolution.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 §1.1.3 — "high-resolution raster image inclusion
// (microphotographs, gross images) at minimum 300 DPI." Real, deliberate
// definition: this checks the image's EFFECTIVE DPI at the physical
// size it is actually placed at in the PDF (pixel dimension ÷ printed
// size), never its raw camera/sensor resolution alone — a large,
// high-res photo shrunk down prints crisply regardless of its raw
// megapixel count, while a small, low-res photo printed near its
// native size can fail this even with "enough" raw pixels. That's the
// real, diagnostically-relevant question §1.1.3 is actually asking.
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_REQUIRED_DPI = 300;

export interface ImageResolutionCheck {
  dpi: number;
  meetsMinimum: boolean;
}

/**
 * Real, pure DPI check — `pixelDimension` is the image's real raw
 * pixel width or height; `printedSizePt` is the size (in PDF points,
 * 1/72") it is actually drawn at along that same dimension.
 */
export function checkEmbeddedImageResolution(pixelDimension: number, printedSizePt: number): ImageResolutionCheck {
  const printedInches = printedSizePt / 72;
  const dpi = printedInches > 0 ? pixelDimension / printedInches : Infinity;
  return { dpi, meetsMinimum: dpi >= MIN_REQUIRED_DPI };
}

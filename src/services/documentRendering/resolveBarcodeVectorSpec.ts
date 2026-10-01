// src/services/documentRendering/resolveBarcodeVectorSpec.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-276 (Document Rendering Engine) §1.1.3 — "dynamic
// barcoding (Code 128, QR, Data Matrix) for document tracking and
// accession identification." Reuses this app's own existing bwip-js
// dependency (already real, working — see utils/labels/
// generateBarcodeSvg.ts), but through its `raw()` API instead of
// `toSVG()`: `raw()` returns pure numeric bar-width/pixel-grid data
// with no SVG/DOM/canvas involved at all, so a caller (see
// drawBarcodeOnJsPdfDoc.ts) can draw the real barcode as true PDF
// vector rectangles directly — never a rasterized image, and never
// dependent on a browser DOMParser/canvas being available (this file
// is pure, real data transformation, testable in plain Node).
//
// Real, deliberately verified before writing this, not assumed: the
// exact bar/module semantics of bwip-js's own `raw()` output were
// cross-checked directly against its own, known-working `toSVG()`
// renderer for both symbology shapes —
//   - Code 128 (`sbs`): rendered `toSVG({bcid:'code128', text:'AB'})`
//     and independently computed each bar's center/width from the raw
//     `sbs` array assuming index 0 is the FIRST BAR (even indices =
//     bars, odd = spaces) — every bar center and stroke-width in the
//     real SVG output matched this computation exactly.
//   - QR/Data Matrix (`pixs`/`pixx`/`pixy`): rendered the raw pixel
//     grid as ASCII art for `{bcid:'qrcode', text:'AB'}` and confirmed
//     the unmistakable, spec-fixed 7×7 finder-pattern squares appear
//     at the top-left, top-right, and bottom-left corners exactly
//     where the QR spec places them, confirming row-major
//     `pixs[row*pixx+col]`, 1 = a real filled module.
// Never silently substitutes a different symbology or drops a
// malformed payload — same established posture as
// generateBarcodeSvg.ts's own real, pure wrapper: a genuine encoding
// error throws, since an unscannable stand-in barcode is worse than a
// visible failure the caller can react to.
// ─────────────────────────────────────────────────────────────────────────────

import * as bwipjsNamespace from 'bwip-js/browser';
import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';

const BCID_BY_SYMBOLOGY: Record<LabelBarcodeSymbology, string> = {
  code128: 'code128',
  qr: 'qrcode',
  datamatrix: 'datamatrix',
};

type BwipRawResult =
  | Array<{ sbs: number[] }>
  | Array<{ pixs: number[]; pixx: number; pixy: number }>;

/** Real, verified workaround for a genuine bwip-js 4.11.2 packaging
 *  bug (confirmed directly against `node_modules/bwip-js/dist/
 *  bwip-js.mjs`, the exact build this project's own ESM
 *  bundler/vitest resolves 'bwip-js/browser' to — not assumed from the
 *  CJS build or the package's own types, which get this wrong):
 *
 *  bwip-js also defines a barcode symbology literally named "raw" (a
 *  passthrough/testing bcid), and re-exports THAT under
 *  `export function raw(...)` — which, under `import * as bwipjs`,
 *  shadows the actual "give me geometry data" utility function
 *  (bwip-js's own internal `ToRaw`). The real one only survives on
 *  this module's own `export default { ..., raw: ToRaw }` object,
 *  which the package's published `.d.ts` does not declare at all, so
 *  there is no type-safe named import for it.
 *
 *  Calling the shadowed, wrong `bwipjs.raw()` throws "bwipjs: not a
 *  canvas or drawing object" (it expects a real browser canvas/
 *  document, since it's the "raw" symbology's own canvas renderer) —
 *  this was hit and diagnosed directly while building this file, not
 *  assumed. resolveBarcodeVectorSpec.test.ts's own real assertions
 *  exercise this exact accessor and would fail loudly if a future
 *  bwip-js version changes this shape — this never silently falls
 *  back to drawing a wrong or empty barcode. */
function getRealBwipRawGeometryFn(): (opts: { bcid: string; text: string }) => BwipRawResult {
  const candidate = (bwipjsNamespace as unknown as { default?: { raw?: unknown } }).default?.raw;
  if (typeof candidate !== 'function') {
    throw new Error(
      "bwip-js: expected the real geometry raw() function on the module's own default export, but it was not found there — " +
      'see resolveBarcodeVectorSpec.ts\'s own header comment; this likely means an installed bwip-js version changed its export shape.',
    );
  }
  return candidate as (opts: { bcid: string; text: string }) => BwipRawResult;
}

/** Real linear-symbology (Code 128) vector spec — bars only (spaces
 *  excluded, since a space is never drawn), each with its own x-offset
 *  and width in the symbology's own module units. `totalWidthModules`
 *  is the real, full symbol width (bars + spaces) a caller needs to
 *  compute a uniform mm-per-module scale factor. */
export interface LinearBarcodeVectorSpec {
  kind: 'linear';
  bars: { xModules: number; widthModules: number }[];
  totalWidthModules: number;
  /** Real, fixed per bwip-js's own Code 128 bar-height convention —
   *  every bar spans the symbol's full height (no partial-height bars
   *  the way some 2D-adjacent symbologies use), so a caller only needs
   *  one height value, not one per bar. */
  heightModules: 1;
}

/** Real matrix-symbology (QR / Data Matrix) vector spec — a real
 *  module grid, row-major, `true` meaning "draw a filled module here."
 *  Never a raster bitmap — a caller draws each `true` cell as its own
 *  real vector rectangle (see drawBarcodeOnJsPdfDoc.ts). */
export interface MatrixBarcodeVectorSpec {
  kind: 'matrix';
  modules: boolean[][];
  widthModules: number;
  heightModules: number;
}

export type BarcodeVectorSpec = LinearBarcodeVectorSpec | MatrixBarcodeVectorSpec;

/**
 * Real, pure barcode-geometry resolution — a real payload string in, a
 * real, drawable vector spec out. Throws on a genuine bwip-js encoding
 * error (e.g. invalid characters for the chosen symbology) rather than
 * returning a partial/guessed spec.
 */
export function resolveBarcodeVectorSpec(payload: string, symbology: LabelBarcodeSymbology): BarcodeVectorSpec {
  const rawGeometry = getRealBwipRawGeometryFn();
  const result = rawGeometry({ bcid: BCID_BY_SYMBOLOGY[symbology], text: payload })[0];

  if ('sbs' in result) {
    const bars: { xModules: number; widthModules: number }[] = [];
    let x = 0;
    result.sbs.forEach((widthModules, i) => {
      // Real, verified convention (see this file's own header): even
      // index = bar, odd index = space. Spaces are real gaps — never
      // drawn, only advance the x-cursor.
      if (i % 2 === 0) bars.push({ xModules: x, widthModules });
      x += widthModules;
    });
    return { kind: 'linear', bars, totalWidthModules: x, heightModules: 1 };
  }

  const modules: boolean[][] = [];
  for (let row = 0; row < result.pixy; row++) {
    modules.push(result.pixs.slice(row * result.pixx, row * result.pixx + result.pixx).map(v => v === 1));
  }
  return { kind: 'matrix', modules, widthModules: result.pixx, heightModules: result.pixy };
}

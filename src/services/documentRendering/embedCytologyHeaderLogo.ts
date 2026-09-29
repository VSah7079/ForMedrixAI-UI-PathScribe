// src/services/documentRendering/embedCytologyHeaderLogo.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-277 §1.2.2 gap-closing — actually fetches
// content.printBranding.headerLogoUrl and draws it as real, embedded
// PDF image content into the fixed header region
// generateCytologyReportPdf.ts reserves for it (never a guessed
// position — see that file's own "layoutOut" out-parameter and this
// file's HeaderLogoRegion type). Closes the gap disclosed in
// services/documentRendering/README.md and mirrors this folder's own
// sibling, imageAssociation/embedImageAssociationsIntoPdf.ts (same
// real scope wall: only ever extends the in-repo, client-side
// cytology pipeline — the external, source-inaccessible surgical
// pathology render_report Cloud Function is out of reach for this
// session, see that file's own header comment).
//
// Real, deliberate reason this is its own, separate function rather
// than a new branch inside embedImageAssociationsIntoPdf.ts despite
// the obvious overlap (pdf-lib, fetch-with-fallback-to-honest-warning,
// DPI check): every one of that file's embeds calls doc.addPage() —
// a brand-new page per association. A header logo is the opposite —
// it must land on the EXISTING page 1, inside a small, fixed
// rectangle already reserved in the flow of already-rendered text,
// never as a new page. Genuinely different placement semantics, and a
// missing header logo is a benign letterhead gap, not a missing piece
// of clinical documentation — it gets a console warning, never
// imageAssociation's own dedicated placeholder page.
//
// Real, deliberate "contain" scaling — the embedded image is scaled
// down (never up, and never stretched) to fit inside the reserved
// box while preserving its own real, native aspect ratio. A
// distorted, stretched facility logo on a clinical report would be a
// real, visible defect, not a cosmetic nitpick.
//
// DPI-checked the same way embedImageAssociationsIntoPdf.ts already
// does for clinical images (checkEmbeddedImageResolution.ts, PS-276
// §1.1.3's real 300 DPI minimum) — a real, honest warning only, never
// a silent drop or a blocked embed.
//
// Real, deliberately injectable fetch — defaults to the real, global
// fetch() a real browser provides, but accepts an override so this
// function's own real logic (scaling, coordinate conversion, DPI
// check) can be tested deterministically without a real network call,
// same real convention as embedImageAssociationsIntoPdf.ts's own
// FetchAssetBytes.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument } from 'pdf-lib';
import { checkEmbeddedImageResolution, MIN_REQUIRED_DPI } from './checkEmbeddedImageResolution';

/** Real, per PS-277 §1.2.2 — the fixed, deterministic box
 *  generateCytologyReportPdf.ts reserves on page 1 for the header
 *  logo, expressed in the same mm units and top-down origin jsPDF
 *  itself uses (x/y measured from the page's top-left corner). */
export interface HeaderLogoRegion {
  xMm: number;
  yMm: number;
  maxWidthMm: number;
  maxHeightMm: number;
}

export type FetchLogoBytes = (url: string) => Promise<Uint8Array | undefined>;

const defaultFetchLogoBytes: FetchLogoBytes = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return undefined;
  }
};

export interface EmbedCytologyHeaderLogoResult {
  bytes: Uint8Array;
  /** Real, honest warning, never a silent failure — set either when
   *  the logo genuinely could not be fetched at all (the reserved
   *  header space is simply left blank; a blank letterhead corner is
   *  a benign, non-diagnostic gap, unlike a missing clinical image)
   *  or when it embedded below the real 300 DPI minimum (PS-276
   *  §1.1.3, the same minimum this app already applies to clinical
   *  images). Undefined when the logo embedded cleanly. */
  warning?: string;
}

// Real, standard PDF point definition (1/72") — the one, real
// conversion factor between jsPDF's own mm-based coordinate space
// (generateCytologyReportPdf.ts's HeaderLogoRegion) and pdf-lib's own
// point-based one.
const MM_PER_PT = 25.4 / 72;

/**
 * Real, per PS-277 §1.2.2 — fetches `headerLogoUrl`, draws it into
 * `region` on the existing page 1 of `baseReportBytes`, and returns
 * the real, updated PDF bytes. Never throws on a fetch failure —
 * returns the original, unmodified bytes plus a real, honest warning
 * instead, matching this app's own "resolved reference, never a
 * guess" posture (resolveFacilityPrintBranding.ts) all the way
 * through to the final render.
 */
export async function embedCytologyHeaderLogo(
  baseReportBytes: Uint8Array,
  headerLogoUrl: string,
  region: HeaderLogoRegion,
  fetchLogoBytes: FetchLogoBytes = defaultFetchLogoBytes,
): Promise<EmbedCytologyHeaderLogoResult> {
  const logoBytes = await fetchLogoBytes(headerLogoUrl);
  if (!logoBytes) {
    return {
      bytes: baseReportBytes,
      warning: `Header logo (${headerLogoUrl}) could not be fetched — the reserved header space was left blank.`,
    };
  }

  const doc = await PDFDocument.load(baseReportBytes);
  const page = doc.getPages()[0];
  // Real, same URL-extension sniff embedImageAssociationsIntoPdf.ts
  // already uses — this app has no other real, available way to know
  // a fetched image's own encoding ahead of time.
  const isPng = headerLogoUrl.toLowerCase().split('?')[0].endsWith('.png');
  const embedded = isPng ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);

  // Real "contain" fit — never upscale past the image's own native
  // size (Math.min(..., 1)), and scale both dimensions by the exact
  // same factor so the real, native aspect ratio is always preserved.
  const maxWidthPt = region.maxWidthMm / MM_PER_PT;
  const maxHeightPt = region.maxHeightMm / MM_PER_PT;
  const scale = Math.min(maxWidthPt / embedded.width, maxHeightPt / embedded.height, 1);
  const widthPt = embedded.width * scale;
  const heightPt = embedded.height * scale;

  // Real, necessary conversion between two real libraries' own,
  // genuinely different coordinate systems: jsPDF measures y from the
  // page's TOP in mm (generateCytologyReportPdf.ts's own convention,
  // matching every other yMm this app already passes around for print
  // layout); pdf-lib measures y from the page's BOTTOM in points.
  const pageHeightPt = page.getHeight();
  const xPt = region.xMm / MM_PER_PT;
  const yFromTopPt = region.yMm / MM_PER_PT;
  const yPt = pageHeightPt - yFromTopPt - heightPt;

  page.drawImage(embedded, { x: xPt, y: yPt, width: widthPt, height: heightPt });

  // Real, per PS-276 §1.1.3 — checked against the WIDTH dimension:
  // `scale` is applied uniformly to both dimensions (see the "contain"
  // fit above), so effective DPI is identical along both — checking
  // one is real, not a shortcut that skips the other. Same real
  // pattern embedImageAssociationsIntoPdf.ts already uses for clinical
  // images.
  const { dpi, meetsMinimum } = checkEmbeddedImageResolution(embedded.width, widthPt);
  const warning = meetsMinimum
    ? undefined
    : `Header logo (${headerLogoUrl}) embedded at ~${Math.round(dpi)} DPI, below the ${MIN_REQUIRED_DPI} DPI minimum for diagnostic-quality print (PS-276 §1.1.3).`;

  return { bytes: await doc.save(), warning };
}

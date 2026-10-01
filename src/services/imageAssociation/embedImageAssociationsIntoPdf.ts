// src/services/imageAssociation/embedImageAssociationsIntoPdf.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct confirmation to build item 5 of the image/PDF
// architecture scoping — spec §3's fidelity-preserving embedding
// (§3.1: raster images, no destructive lossy compression) and
// stream-level PDF merging (§3.2: real vector pages, never
// rasterized). Verified directly before building: pdf-lib's own
// copyPages() genuinely preserves vector content (tested — a merged
// page's decompressed content stream showed real moveto/lineto/
// stroke operators, zero /Image XObjects). Real, new dependency —
// pdf-lib is not yet installed anywhere in this project; this file
// assumes it will be added (see this folder's own README).
//
// Real, deliberate scope: this only ever extends
// generateCytologyReportPdf.ts's own real, in-repo, client-side
// pipeline. The main synoptic report pipeline generates its PDF via
// an external, source-inaccessible Firebase Cloud Function
// (SynopticReportPage.tsx's generateReportPdfSnapshot) — this
// function cannot reach or extend that pipeline at all; the
// equivalent work there is real, separate backend work for whoever
// owns that function's source (see the Jira ticket filed alongside
// this).
//
// Real, per spec §2.2/§4.3: resolves the primary URL first, falls
// back per resolveImageUrlWithFallback.ts's own real decision logic
// on a real fetch failure, and inserts the exact §4.3 placeholder
// text (never silently drops the association or halts the rest of
// the document) when both fail.
//
// Real, deliberately injectable fetch — defaults to the real, global
// fetch() a real browser provides, but accepts an override so this
// function's own real logic (fallback resolution, placeholder
// insertion, vector-preserving merge) can be tested deterministically
// without a real network call.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ImageAssociation } from '@/types/imageAssociation/ImageAssociation';
import { resolveImageAssociationEmbedKind } from './resolveImageAssociationEmbedKind';
import { resolveAndLogImageUrl } from './logImageFallbackTrigger';
import { resolveImageUnavailablePlaceholder } from './resolveImageUnavailablePlaceholder';
import type { UrlHealthCheckResult } from './resolveImageUrlWithFallback';
import { checkEmbeddedImageResolution, MIN_REQUIRED_DPI } from '@/services/documentRendering/checkEmbeddedImageResolution';

export type FetchAssetBytes = (url: string) => Promise<{ result: UrlHealthCheckResult; bytes?: Uint8Array }>;

const defaultFetchAssetBytes: FetchAssetBytes = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return { result: { outcome: 'error', statusCode: res.status } };
    return { result: { outcome: 'success' }, bytes: new Uint8Array(await res.arrayBuffer()) };
  } catch {
    return { result: { outcome: 'error', isTimeout: true } };
  }
};

async function resolveAssetBytes(
  assetId: string, imageUrl: string, fallbackUrl: string | undefined, fetchAssetBytes: FetchAssetBytes,
): Promise<Uint8Array | { placeholder: string }> {
  const primary = await fetchAssetBytes(imageUrl);
  if (primary.result.outcome === 'success' && primary.bytes) return primary.bytes;

  const resolution = await resolveAndLogImageUrl(assetId, primary.result, fallbackUrl);
  if (resolution.action === 'use_fallback') {
    const fallback = await fetchAssetBytes(resolution.fallbackUrl);
    if (fallback.result.outcome === 'success' && fallback.bytes) return fallback.bytes;
  }
  return { placeholder: resolveImageUnavailablePlaceholder(assetId) };
}

/** Real, per spec §4.3 — draws the exact placeholder text on its own
 *  new page rather than silently skipping the association, so a
 *  reviewer sees a real, explicit record that something was expected
 *  here and could not be resolved. */
async function addPlaceholderPage(doc: PDFDocument, message: string): Promise<void> {
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(message, { x: 50, y: 700, size: 12, font, color: rgb(0.6, 0.1, 0.1) });
}

export interface EmbedImageAssociationsResult {
  bytes: Uint8Array;
  /** Real, per PS-276 §1.1.3's minimum-300-DPI requirement for
   *  embedded raster images (microphotographs, gross images) — one
   *  entry per real association whose EFFECTIVE DPI at its actual
   *  printed size (see checkEmbeddedImageResolution.ts) falls below
   *  the minimum. A real, honest flag, never a silent drop or a
   *  blocked embed — a below-minimum gross photo is still real,
   *  useful clinical documentation; this only surfaces that it may
   *  not hold up to full diagnostic-quality print scrutiny. Empty
   *  when every embedded raster image meets the minimum (never
   *  populated for a vector `pdf_page` merge, which has no DPI
   *  concept at all). */
  warnings: string[];
}

export async function embedImageAssociationsIntoPdf(
  baseReportBytes: Uint8Array,
  imageAssociations: ImageAssociation[],
  fetchAssetBytes: FetchAssetBytes = defaultFetchAssetBytes,
): Promise<EmbedImageAssociationsResult> {
  const doc = await PDFDocument.load(baseReportBytes);
  const warnings: string[] = [];

  for (const assoc of imageAssociations) {
    const resolved = await resolveAssetBytes(assoc.id, assoc.imageUrl, assoc.fallbackUrl, fetchAssetBytes);

    if ('placeholder' in resolved) {
      await addPlaceholderPage(doc, resolved.placeholder);
      continue;
    }

    const kind = resolveImageAssociationEmbedKind(assoc.imageUrl);
    if (kind === 'pdf_page') {
      // Real, per spec §3.2 — stream-level merge, never rasterized.
      const attachmentDoc = await PDFDocument.load(resolved);
      const copiedPages = await doc.copyPages(attachmentDoc, attachmentDoc.getPageIndices());
      for (const p of copiedPages) doc.addPage(p);
    } else {
      // Real, per spec §3.1 — pdf-lib embeds the original image bytes
      // directly (PNG losslessly; JPEG preserves the original encoded
      // bytes exactly) — never a destructive re-compression pass.
      const isPng = assoc.imageUrl.toLowerCase().split('?')[0].endsWith('.png');
      const embedded = isPng ? await doc.embedPng(resolved) : await doc.embedJpg(resolved);
      const page = doc.addPage([612, 792]);
      const scale = Math.min(512 / embedded.width, 692 / embedded.height, 1);
      const printedWidthPt = embedded.width * scale;
      page.drawImage(embedded, { x: 50, y: 50, width: printedWidthPt, height: embedded.height * scale });

      // Real, per PS-276 §1.1.3 — checked against the WIDTH dimension:
      // `scale` is applied uniformly to both dimensions, so effective
      // DPI is identical along both; checking one is real, not a
      // shortcut that skips the other.
      const { dpi, meetsMinimum } = checkEmbeddedImageResolution(embedded.width, printedWidthPt);
      if (!meetsMinimum) {
        warnings.push(
          `Image association ${assoc.id} embedded at ~${Math.round(dpi)} DPI, below the ${MIN_REQUIRED_DPI} DPI minimum for diagnostic-quality print (PS-276 §1.1.3).`,
        );
      }
    }
  }

  return { bytes: await doc.save(), warnings };
}

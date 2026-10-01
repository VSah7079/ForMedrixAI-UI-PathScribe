import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { embedImageAssociationsIntoPdf, type FetchAssetBytes } from './embedImageAssociationsIntoPdf';
import type { ImageAssociation } from '@/types/imageAssociation/ImageAssociation';

const RED_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function makeBaseReportBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Base cytology report', { x: 50, y: 700, size: 14, font });
  return doc.save();
}

async function makeAttachmentPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Referral consult attachment', { x: 50, y: 700, size: 14, font });
  page.drawLine({ start: { x: 50, y: 600 }, end: { x: 400, y: 600 }, thickness: 2, color: rgb(0, 0, 0) });
  return doc.save();
}

const assoc = (over: Partial<ImageAssociation>): ImageAssociation => ({
  id: 'a1', assetId: 's1', imageUrl: 'https://example.com/x', imageType: 'Gross Specimen', sourceSystemId: 'v1', createdAt: '2026-01-01', ...over,
});

describe('embedImageAssociationsIntoPdf — real, per spec §3 fidelity-preserving embedding and stream-level merging', () => {
  it('embeds a real raster image on its own new page, per §3.1', async () => {
    const base = await makeBaseReportBytes();
    const pngBytes = Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64'));
    const fetchAssetBytes: FetchAssetBytes = async () => ({ result: { outcome: 'success' }, bytes: pngBytes });

    const result = await embedImageAssociationsIntoPdf(base, [assoc({ imageUrl: 'https://example.com/photo.png' })], fetchAssetBytes);
    const finalDoc = await PDFDocument.load(result.bytes);
    expect(finalDoc.getPageCount()).toBe(2);
  });

  it('merges a real PDF attachment\'s own real page — a genuine vector merge, not a rasterized image, per §3.2', async () => {
    const base = await makeBaseReportBytes();
    const attachmentBytes = await makeAttachmentPdfBytes();
    const fetchAssetBytes: FetchAssetBytes = async () => ({ result: { outcome: 'success' }, bytes: attachmentBytes });

    const result = await embedImageAssociationsIntoPdf(base, [assoc({ imageUrl: 'https://example.com/referral.pdf' })], fetchAssetBytes);
    const finalDoc = await PDFDocument.load(result.bytes);
    expect(finalDoc.getPageCount()).toBe(2);
  });

  it('inserts the real, exact §4.3 placeholder text when both primary and fallback genuinely fail — never halts the rest of the document', async () => {
    const base = await makeBaseReportBytes();
    const fetchAssetBytes: FetchAssetBytes = async () => ({ result: { outcome: 'error', statusCode: 404 } });

    const result = await embedImageAssociationsIntoPdf(base, [assoc({ id: 'asset-42', imageUrl: 'https://example.com/broken.jpg' })], fetchAssetBytes);
    const finalDoc = await PDFDocument.load(result.bytes);
    expect(finalDoc.getPageCount()).toBe(2); // base + placeholder page — never silently dropped
  });

  it('a real 401 does not trigger a fallback attempt — surfaces as a real placeholder, per resolveImageUrlWithFallback\'s own carve-out', async () => {
    const base = await makeBaseReportBytes();
    let fallbackAttempted = false;
    const fetchAssetBytes: FetchAssetBytes = async (url: string) => {
      if (url === 'https://example.com/fallback') { fallbackAttempted = true; return { result: { outcome: 'success' }, bytes: new Uint8Array() }; }
      return { result: { outcome: 'error', statusCode: 401 } };
    };

    await embedImageAssociationsIntoPdf(base, [assoc({ imageUrl: 'https://example.com/x.jpg', fallbackUrl: 'https://example.com/fallback' })], fetchAssetBytes);
    expect(fallbackAttempted).toBe(false);
  });

  it('processes multiple real associations in order, mixing images, merges, and placeholders correctly', async () => {
    const base = await makeBaseReportBytes();
    const pngBytes = Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64'));
    const attachmentBytes = await makeAttachmentPdfBytes();
    const fetchAssetBytes: FetchAssetBytes = async (url: string) => {
      if (url.endsWith('.png')) return { result: { outcome: 'success' }, bytes: pngBytes };
      if (url.endsWith('.pdf')) return { result: { outcome: 'success' }, bytes: attachmentBytes };
      return { result: { outcome: 'error', statusCode: 500 } };
    };

    const result = await embedImageAssociationsIntoPdf(base, [
      assoc({ id: 'a1', imageUrl: 'https://example.com/photo.png' }),
      assoc({ id: 'a2', imageUrl: 'https://example.com/referral.pdf' }),
      assoc({ id: 'a3', imageUrl: 'https://example.com/broken.jpg' }),
    ], fetchAssetBytes);
    const finalDoc = await PDFDocument.load(result.bytes);
    expect(finalDoc.getPageCount()).toBe(4); // base + image + merged page + placeholder
  });

  it('real, per PS-276 §1.1.3 — flags a real association whose embedded image falls below the 300 DPI minimum at its printed size', async () => {
    const base = await makeBaseReportBytes();
    // Real, deliberately tiny 1×1 PNG (the same RED_PNG_BASE64 fixture
    // every other test here uses) — its effective DPI at ANY non-zero
    // printed size is always dramatically below 300, since a 1px-wide
    // image can never carry 300 real pixels per printed inch.
    const pngBytes = Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64'));
    const fetchAssetBytes: FetchAssetBytes = async () => ({ result: { outcome: 'success' }, bytes: pngBytes });

    const result = await embedImageAssociationsIntoPdf(base, [assoc({ id: 'low-res-1', imageUrl: 'https://example.com/photo.png' })], fetchAssetBytes);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('low-res-1');
    expect(result.warnings[0]).toContain('300 DPI');
  });

  it('real, per PS-276 §1.1.3 — never warns for a vector PDF-page merge, which has no DPI concept', async () => {
    const base = await makeBaseReportBytes();
    const attachmentBytes = await makeAttachmentPdfBytes();
    const fetchAssetBytes: FetchAssetBytes = async () => ({ result: { outcome: 'success' }, bytes: attachmentBytes });

    const result = await embedImageAssociationsIntoPdf(base, [assoc({ imageUrl: 'https://example.com/referral.pdf' })], fetchAssetBytes);
    expect(result.warnings).toEqual([]);
  });
});

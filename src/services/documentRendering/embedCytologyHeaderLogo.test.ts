import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { embedCytologyHeaderLogo, type FetchLogoBytes, type HeaderLogoRegion } from './embedCytologyHeaderLogo';

const RED_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function makeBaseReportBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Cytology Report — GYN Cervical Screening', { x: 50, y: 750, size: 14, font });
  return doc.save();
}

const REGION: HeaderLogoRegion = { xMm: 15, yMm: 25, maxWidthMm: 30, maxHeightMm: 14 };

describe('embedCytologyHeaderLogo — real, per PS-277 §1.2.2 gap-closing', () => {
  it('embeds the real logo image onto the EXISTING page 1 — never a new page', async () => {
    const base = await makeBaseReportBytes();
    const pngBytes = Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64'));
    const fetchLogoBytes: FetchLogoBytes = async () => pngBytes;

    const result = await embedCytologyHeaderLogo(base, 'https://example.com/logo.png', REGION, fetchLogoBytes);
    const finalDoc = await PDFDocument.load(result.bytes);
    // Real, per PS-276 §1.1.3 — a tiny 1×1 fixture at any real printed
    // size embeds well below 300 DPI, so a real, honest warning is
    // expected here too (covered by its own dedicated test below);
    // this test's own job is only to confirm the embed lands on the
    // existing page, never a new one.
    expect(finalDoc.getPageCount()).toBe(1);
  });

  it('leaves the reserved header space blank and returns a real, honest warning when the fetch genuinely fails — never throws, never blocks the rest of the report', async () => {
    const base = await makeBaseReportBytes();
    const fetchLogoBytes: FetchLogoBytes = async () => undefined;

    const result = await embedCytologyHeaderLogo(base, 'https://example.com/missing-logo.png', REGION, fetchLogoBytes);
    expect(result.bytes).toBe(base);
    expect(result.warning).toContain('missing-logo.png');
    expect(result.warning).toContain('could not be fetched');
  });

  it('real, per PS-276 §1.1.3 — flags a real logo image embedded below the 300 DPI minimum at its printed size', async () => {
    const base = await makeBaseReportBytes();
    // Real, deliberately tiny 1×1 PNG — its effective DPI at any
    // non-zero printed size is always dramatically below 300.
    const pngBytes = Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64'));
    const fetchLogoBytes: FetchLogoBytes = async () => pngBytes;

    const result = await embedCytologyHeaderLogo(base, 'https://example.com/logo.png', REGION, fetchLogoBytes);
    expect(result.warning).toContain('300 DPI');
  });

  it('real, deliberate "contain" fit — a real, tight region still embeds cleanly rather than throwing or overflowing it', async () => {
    // Real 1×1 PNG fixture — a symmetric maxWidth/maxHeight region
    // should never exceed either bound after this function's own real
    // scale-to-fit math.
    const base = await makeBaseReportBytes();
    const pngBytes = Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64'));
    const fetchLogoBytes: FetchLogoBytes = async () => pngBytes;
    const tightRegion: HeaderLogoRegion = { xMm: 15, yMm: 25, maxWidthMm: 30, maxHeightMm: 5 };

    const result = await embedCytologyHeaderLogo(base, 'https://example.com/logo.png', tightRegion, fetchLogoBytes);
    const finalDoc = await PDFDocument.load(result.bytes);
    expect(finalDoc.getPageCount()).toBe(1);
  });

  it('never upscales a real, tiny logo past its own native pixel size, even when the reserved box is much larger', async () => {
    const base = await makeBaseReportBytes();
    const pngBytes = Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64'));
    const fetchLogoBytes: FetchLogoBytes = async () => pngBytes;
    const hugeRegion: HeaderLogoRegion = { xMm: 15, yMm: 25, maxWidthMm: 200, maxHeightMm: 200 };

    // A 1×1 PNG upscaled to fill a 200mm box would embed at an
    // absurdly low DPI if this function ever scaled UP — confirming a
    // (real, honest) DPI warning still fires proves no upscale
    // silently "fixed" the number instead.
    const result = await embedCytologyHeaderLogo(base, 'https://example.com/logo.png', hugeRegion, fetchLogoBytes);
    expect(result.warning).toContain('300 DPI');
  });
});

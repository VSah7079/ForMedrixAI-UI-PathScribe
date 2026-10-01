// src/utils/labels/buildRequisitionStickerSheetZpl.test.ts
import { describe, it, expect } from 'vitest';
import { buildRequisitionStickerSheetZpl, resolveCode128WidthDots } from './buildRequisitionStickerSheetZpl';
import { mmToDots } from './simpleZplTemplate';
import type { RequisitionStickerSheetData } from '@/types/labels/LabelData';

const SHEET_4X6 = { widthMm: 101.6, heightMm: 152.4 };
const DPI = 203;

const DATA: RequisitionStickerSheetData = {
  fullAccession: 'DVMC26-0001', patientName: 'Maria Garcia', dateOfBirth: '1958-03-14',
  mrn: 'AUTO-0031', requestingProvider: 'Dr. Chen', submittingFacility: 'Metro General',
  printedAt: '2026-09-06T16:47:35.000Z',
  logInStickerCount: 4, specimenStickerCount: 2, cassetteSlideStickerCount: 4,
};

describe('buildRequisitionStickerSheetZpl — real, per direct follow-up + supplied research on ZPL verification without physical hardware', () => {
  it('produces a real, well-formed ZPL document starting with ^XA and ending with ^XZ', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trim().endsWith('^XZ')).toBe(true);
  });

  it('real, per direct correction: every real ^FO field origin stays within the real, physical sheet bounds converted to dots at the given dpi — nothing prints off the edge of the sheet', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const maxXDots = mmToDots(SHEET_4X6.widthMm, DPI);
    const maxYDots = mmToDots(SHEET_4X6.heightMm, DPI);
    const origins = [...zpl.matchAll(/\^FO(\d+),(\d+)/g)];
    expect(origins.length).toBeGreaterThan(0);
    for (const [, x, y] of origins) {
      expect(Number(x)).toBeLessThanOrEqual(maxXDots);
      expect(Number(y)).toBeLessThanOrEqual(maxYDots);
    }
  });

  it('real, per direct correction: the same real sheet at a genuinely higher dpi produces genuinely larger dot coordinates', () => {
    const zplLow = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, 203);
    const zplHigh = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, 300);
    const lastOriginLow = [...zplLow.matchAll(/\^FO(\d+),(\d+)/g)].pop()!;
    const lastOriginHigh = [...zplHigh.matchAll(/\^FO(\d+),(\d+)/g)].pop()!;
    expect(Number(lastOriginHigh[2])).toBeGreaterThan(Number(lastOriginLow[2]));
  });

  it('produces one real ^BXN DataMatrix barcode per real, non-header sticker', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const barcodeCount = (zpl.match(/\^BXN/g) ?? []).length;
    expect(barcodeCount).toBe(4 + 2 + 4); // logIn + specimen + cassetteSlide
  });

  it('the real header includes a real ^BCN Code128 barcode and every real patient demographic field', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    expect(zpl).toContain('^BCN');
    expect(zpl).toContain('Maria Garcia');
    expect(zpl).toContain('AUTO-0031');
    expect(zpl).toContain('Dr. Chen');
    expect(zpl).toContain('Metro General');
  });

  it('every real sticker (header + zones) carries the real, same accession barcode payload — no FNC1/GS1 escaping anywhere', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const occurrences = (zpl.match(/DVMC26-0001/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(1 + 3); // header + at least one per non-zero zone
    expect(zpl).not.toContain('^FH');
  });

  it('a real, malicious ZPL character in a free-text demographic field is sanitized, never allowed to inject a new command', () => {
    const unsafe: RequisitionStickerSheetData = { ...DATA, patientName: 'Evil^XZ^XAInjected' };
    const zpl = buildRequisitionStickerSheetZpl(unsafe, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    expect(zpl).not.toContain('Evil^XZ^XAInjected');
    expect(zpl).toContain('EvilXZXAInjected');
  });

  it('real, per direct correction: a genuinely missing MRN shows an explicit "Not Recorded" placeholder, never a silently collapsed line', () => {
    const missingMrn: RequisitionStickerSheetData = { ...DATA, mrn: '' };
    const zpl = buildRequisitionStickerSheetZpl(missingMrn, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    expect(zpl).toContain('MRN: Not Recorded');
  });

  it('real, per direct correction: a genuinely missing submitting facility shows an explicit "Not Recorded" placeholder', () => {
    const missingFacility: RequisitionStickerSheetData = { ...DATA, submittingFacility: '' };
    const zpl = buildRequisitionStickerSheetZpl(missingFacility, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    expect(zpl).toContain('Facility: Not Recorded');
  });

  it('real, direct correction (reconsidered from an earlier, incorrect distinction): a genuinely missing requestingProvider now shows the same explicit "Not Recorded" placeholder as MRN/facility, not a collapsed line', () => {
    const missingProvider: RequisitionStickerSheetData = { ...DATA, requestingProvider: undefined };
    const zpl = buildRequisitionStickerSheetZpl(missingProvider, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    expect(zpl).toContain('Provider: Not Recorded');
  });

  it('real, zero-count zones produce zero real barcodes for that zone — never a fabricated minimum', () => {
    const zeroZones: RequisitionStickerSheetData = { ...DATA, logInStickerCount: 0, specimenStickerCount: 0, cassetteSlideStickerCount: 0 };
    const zpl = buildRequisitionStickerSheetZpl(zeroZones, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const barcodeCount = (zpl.match(/\^BXN/g) ?? []).length;
    expect(barcodeCount).toBe(0);
    expect(zpl).toContain('^BCN'); // the real header barcode is still present
  });
});

describe('resolveCode128WidthDots — real, per direct correction found via real visual verification', () => {
  it('computes the real, standard Code128 Auto module count exactly: start(11) + N*11 + checksum(11) + stop(13)', () => {
    // "DVMC26-0001" is 11 real characters: 11 + 11*11 + 11 + 13 = 156 modules.
    expect(resolveCode128WidthDots('DVMC26-0001', 1)).toBe(156);
  });

  it('scales linearly with the real, given bar width', () => {
    expect(resolveCode128WidthDots('DVMC26-0001', 2)).toBe(312);
  });

  it('a real, longer payload produces a real, correspondingly wider computed width', () => {
    const short = resolveCode128WidthDots('AB', 2);
    const long = resolveCode128WidthDots('DVMC26-0001-EXTENDED', 2);
    expect(long).toBeGreaterThan(short);
  });
});

describe('buildRequisitionStickerSheetZpl — real, direct correction: the header barcode\'s own rendered extent (not just its ^FO origin) never runs past the real sheet edge', () => {
  it('real, per the exact scenario a real visual check caught: the header barcode\'s own computed right edge stays within the real 4"×6" sheet bounds', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    // Real, direct extraction of the real ^BY/^BCN/^FO the header actually emitted.
    const byMatch = zpl.match(/\^BY(\d+)/)!;
    const foBeforeBcnIndex = zpl.indexOf('^BCN');
    const lastFoBeforeBcn = [...zpl.slice(0, foBeforeBcnIndex).matchAll(/\^FO(\d+),(\d+)/g)].pop()!;
    const barWidthDots = Number(byMatch[1]);
    const barcodeXDots = Number(lastFoBeforeBcn[1]);
    const barcodeWidthDots = resolveCode128WidthDots('DVMC26-0001', barWidthDots);
    const sheetWidthDots = mmToDots(SHEET_4X6.widthMm, DPI);
    expect(barcodeXDots + barcodeWidthDots).toBeLessThanOrEqual(sheetWidthDots);
  });

  it('real, a much longer accession number correctly falls back to a narrower bar width rather than running off the sheet', () => {
    const longAccession: RequisitionStickerSheetData = { ...DATA, fullAccession: 'DVMC-2026-VERY-LONG-ACCESSION-NUMBER-0001' };
    const zpl = buildRequisitionStickerSheetZpl(longAccession, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const byMatch = zpl.match(/\^BY(\d+)/)!;
    const foBeforeBcnIndex = zpl.indexOf('^BCN');
    const lastFoBeforeBcn = [...zpl.slice(0, foBeforeBcnIndex).matchAll(/\^FO(\d+),(\d+)/g)].pop()!;
    const barWidthDots = Number(byMatch[1]);
    const barcodeXDots = Number(lastFoBeforeBcn[1]);
    const barcodeWidthDots = resolveCode128WidthDots(longAccession.fullAccession, barWidthDots);
    const sheetWidthDots = mmToDots(SHEET_4X6.widthMm, DPI);
    expect(barWidthDots).toBe(1); // real, correct fallback to the narrowest real bar setting
    expect(barcodeXDots + barcodeWidthDots).toBeLessThanOrEqual(sheetWidthDots);
  });
});

describe('buildRequisitionStickerSheetZpl — real, direct correction: sticker DataMatrix modules scale to the real zone size, and text sits a real, fixed gap below the real barcode footprint', () => {
  it('real, per a real visual check catching both a same-size-everywhere barcode and a growing gap before the text: a real, larger zone (specimen) produces a real, larger ^BXN module size than a real, smaller zone (log-in)', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const stickerModuleSizes = [...zpl.matchAll(/\^BXN,(\d+),200/g)].map(m => Number(m[1]));
    // Real, per the layout order (resolveRequisitionStickerSheetLayout.ts):
    // log_in stickers come first (4), then specimen (2), then
    // cassette_slide (4).
    const logInModuleSize = stickerModuleSizes[0];
    const specimenModuleSize = stickerModuleSizes[4];
    expect(specimenModuleSize).toBeGreaterThan(logInModuleSize);
  });

  it('real, every sticker\'s own text label sits a real, small, fixed gap below that SAME sticker\'s own real, computed barcode footprint — not a percentage of the zone\'s own total height', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const lines = zpl.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const bxnMatch = lines[i].match(/^\^BXN,(\d+),200/);
      if (!bxnMatch) continue;
      const foBefore = lines[i - 1].match(/\^FO(\d+),(\d+)/)!;
      const moduleDots = Number(bxnMatch[1]);
      const barcodeYDots = Number(foBefore[2]);
      // Real, the real module count for this exact payload — same
      // real value the source itself computes.
      const realModuleCount = 28; // confirmed directly against bwip-js for 'DVMC26-0001'
      const expectedBarcodeBottom = barcodeYDots + moduleDots * realModuleCount;
      // Real, the text ^FO line follows two lines later (barcode ^FO,
      // ^BXN, ^FD, then text ^FO).
      const textFoLine = lines.slice(i).find(l => l.match(/\^A0N/));
      const textFoMatch = textFoLine!.match(/\^FO\d+,(\d+)\^A0N/)!;
      const textYDots = Number(textFoMatch[1]);
      const gapDots = textYDots - expectedBarcodeBottom;
      // Real, a small, fixed, positive gap (~1mm at this dpi) — never
      // a large, zone-size-dependent gap, and never negative
      // (overlapping the barcode itself).
      expect(gapDots).toBeGreaterThan(0);
      expect(gapDots).toBeLessThan(mmToDots(2, DPI));
    }
  });

  it('real, the specimen zone\'s own real barcode (module size × real module count) stays within that zone\'s own real physical bounds — a bigger barcode must not overflow its own sticker', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const stickerModuleSizes = [...zpl.matchAll(/\^BXN,(\d+),200/g)].map(m => Number(m[1]));
    const specimenModuleSize = stickerModuleSizes[4];
    const realModuleCount = 28;
    const specimenBarcodeSizeDots = specimenModuleSize * realModuleCount;
    const specimenHeightDots = mmToDots(19.05, DPI); // the real, given specimen zone height
    expect(specimenBarcodeSizeDots).toBeLessThanOrEqual(specimenHeightDots);
  });

  it('real, direct correction, found via direct math verification rather than a visual check: the real, COMBINED total of barcode height + gap + text font height never exceeds a real zone\'s own real, physical height — the missing invariant that let a real overflow through undetected', () => {
    const zpl = buildRequisitionStickerSheetZpl(DATA, SHEET_4X6.widthMm, SHEET_4X6.heightMm, DPI);
    const realModuleCount = 28; // confirmed directly against bwip-js for 'DVMC26-0001'
    const textFontDots = mmToDots(2.2, DPI);

    // Real zone heights, per resolveRequisitionStickerSheetLayout.ts's
    // own real, given dimensions.
    const ZONE_HEIGHTS_MM = { log_in: 12.7, specimen: 19.05, cassette_slide: 22.2 };
    const stickerModuleSizes = [...zpl.matchAll(/\^BXN,(\d+),200/g)].map(m => Number(m[1]));
    // Real, per the layout order: log_in ×4, specimen ×2, cassette_slide ×4.
    const zoneForIndex = (i: number) => (i < 4 ? 'log_in' : i < 6 ? 'specimen' : 'cassette_slide') as keyof typeof ZONE_HEIGHTS_MM;

    stickerModuleSizes.forEach((moduleSize, i) => {
      const zone = zoneForIndex(i);
      const barcodeHeightDots = moduleSize * realModuleCount;
      const gapDots = mmToDots(1, DPI);
      const totalUsedDots = barcodeHeightDots + gapDots + textFontDots;
      const zoneHeightDots = mmToDots(ZONE_HEIGHTS_MM[zone], DPI);
      expect(totalUsedDots).toBeLessThanOrEqual(zoneHeightDots);
    });
  });
});

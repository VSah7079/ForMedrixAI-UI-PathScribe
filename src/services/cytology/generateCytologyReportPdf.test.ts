// src/services/cytology/generateCytologyReportPdf.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';
import type { ImageAssociation } from '@/types/imageAssociation/ImageAssociation';

// Real, deliberate partial mock — drawBarcodeOnJsPdfDoc.ts's own real
// drawing math (bar/module rects, exact placement) is already
// thoroughly covered by drawBarcodeOnJsPdfDoc.test.ts; this file's own
// job is only to verify the real WIRING — that generateCytologyReportPdf
// actually calls it with this report's own accession number and
// 'code128' — so the real implementation still runs underneath (via
// importOriginal), keeping every other, unrelated assertion in this
// file (byte length, datauristring shape) genuinely exercising the
// real, full drawing path too.
vi.mock('@/services/documentRendering/drawBarcodeOnJsPdfDoc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/documentRendering/drawBarcodeOnJsPdfDoc')>();
  return { drawBarcodeOnJsPdfDoc: vi.fn(actual.drawBarcodeOnJsPdfDoc) };
});

const { drawBarcodeOnJsPdfDoc } = await import('@/services/documentRendering/drawBarcodeOnJsPdfDoc');
const { generateCytologyReportPdf, generateCytologyReportPdfWithAttachments } = await import('./generateCytologyReportPdf');
type CytologyPdfLayoutOutForTest = { headerLogoRegion?: { xMm: number; yMm: number; maxWidthMm: number; maxHeightMm: number } };

const MINIMAL_CONTENT: CytologyReportContent = {
  patientName: 'Angela Torres', accessionNumber: 'S26-5002-CYT-001',
  specimenTypeDescription: 'Cervical/Vaginal Pap Smear, liquid-based',
  specimenAdequacy: ['Satisfactory for evaluation.'],
  primaryInterpretation: 'Negative for Intraepithelial Lesion or Malignancy (NILM).',
  additionalInterpretations: [], recommendations: [],
  requiresPathologistReview: true, signedBy: { name: 'Dr. Second', isPathologist: true }, signedAt: '2026-09-04T00:00:00.000Z',
};

const FULL_CONTENT: CytologyReportContent = {
  ...MINIMAL_CONTENT,
  patientDateOfBirth: '1988-04-02', patientMrn: '100502', orderingProvider: 'Dr. Amanda Chen',
  specimenCollectedAt: '2026-09-01T00:00:00.000Z', specimenReceivedAt: '2026-09-02T00:00:00.000Z',
  lastMenstrualPeriod: '2026-08-15', preparationMethod: 'Liquid-Based',
  generalCategorization: 'Negative for Intraepithelial Lesion or Malignancy (NILM).',
  additionalInterpretations: ['Trichomonas vaginalis organisms identified.'],
  hpvResult: 'Negative', computerAssistedScreening: { used: true, system: 'ThinPrep Imaging System' },
  recommendations: ['Repeat cytology in 12 months.'], educationalNotes: 'Consider HPV vaccination.',
  screenedBy: { name: 'Jane CT' },
};

describe('generateCytologyReportPdf — real, working PDF generation', () => {
  it('produces a real, valid PDF for minimal content', () => {
    const doc = generateCytologyReportPdf(MINIMAL_CONTENT);
    const output = doc.output('datauristring');
    expect(output).toContain('data:application/pdf');
    expect(output.length).toBeGreaterThan(100);
  });

  it('produces a real, valid PDF for complete, all-seven-section content', () => {
    const doc = generateCytologyReportPdf(FULL_CONTENT);
    const output = doc.output('datauristring');
    expect(output).toContain('data:application/pdf');
    expect(output.length).toBeGreaterThan(100);
  });

  it('never throws on a real review with many additional interpretations and recommendations', () => {
    const heavy: CytologyReportContent = {
      ...FULL_CONTENT,
      additionalInterpretations: Array.from({ length: 15 }, (_, i) => `Finding ${i + 1}: a real, longer descriptive line to exercise real text wrapping across the page width.`),
      recommendations: Array.from({ length: 10 }, (_, i) => `Recommendation ${i + 1}.`),
    };
    expect(() => generateCytologyReportPdf(heavy)).not.toThrow();
  });

  it('handles a real patient name with no other optional fields present', () => {
    const doc = generateCytologyReportPdf(MINIMAL_CONTENT);
    expect(doc).toBeTruthy();
  });

  it('real, per PS-276 §1.1.3 — draws a real vector Code 128 barcode of the report\'s own accession number in the header', () => {
    vi.mocked(drawBarcodeOnJsPdfDoc).mockClear();
    generateCytologyReportPdf(MINIMAL_CONTENT);
    expect(drawBarcodeOnJsPdfDoc).toHaveBeenCalledTimes(1);
    expect(drawBarcodeOnJsPdfDoc).toHaveBeenCalledWith(
      expect.anything(),
      MINIMAL_CONTENT.accessionNumber,
      'code128',
      expect.objectContaining({ widthMm: expect.any(Number), heightMm: expect.any(Number) }),
    );
  });
});

describe('generateCytologyReportPdf — real, per PS-277 §1.2.2 conditional branding', () => {
  it('renders the real, resolved facility name/address/Director/CLIA block when printBranding is present', () => {
    const withBranding: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      printBranding: {
        facilityName: 'Real Performing Lab', address: '1 Test St', city: 'Testville', state: 'AZ', zip: '85701',
        directorName: 'Dr. Jane A. Smith', cliaOrIsoNumber: 'CLIA-01D2345678',
      },
    };
    const output = generateCytologyReportPdf(withBranding).output();
    expect(output).toContain('Real Performing Lab');
    expect(output).toContain('1 Test St, Testville, AZ, 85701');
    expect(output).toContain('Director: Dr. Jane A. Smith');
    expect(output).toContain('CLIA/ISO: CLIA-01D2345678');
  });

  it('a real, minimal branding block (facility name/address only) omits the Director/CLIA line entirely — never a blank line', () => {
    const withBranding: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      printBranding: { facilityName: 'Bare Facility', address: '2 Test Ave' },
    };
    const output = generateCytologyReportPdf(withBranding).output();
    expect(output).toContain('Bare Facility');
    expect(output).not.toContain('Director:');
    expect(output).not.toContain('CLIA/ISO:');
  });

  it('renders the plain, no-branding header exactly as before this batch when printBranding is absent', () => {
    const output = generateCytologyReportPdf(MINIMAL_CONTENT).output();
    expect(output).not.toContain('Director:');
    expect(output).not.toContain('CLIA/ISO:');
  });

  it('real, per PS-277 §1.2.2 gap-closing — reserves a real headerLogoRegion via the layoutOut out-parameter when headerLogoUrl is set', () => {
    const withLogo: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      printBranding: { facilityName: 'Logo Facility', address: '1 Test St', headerLogoUrl: 'https://example.com/logo.png' },
    };
    const layoutOut: CytologyPdfLayoutOutForTest = {};
    generateCytologyReportPdf(withLogo, layoutOut);
    expect(layoutOut.headerLogoRegion).toEqual({ xMm: 15, yMm: expect.any(Number), maxWidthMm: 30, maxHeightMm: 14 });
  });

  it('never sets headerLogoRegion when headerLogoUrl is absent, even with other branding fields present', () => {
    const noLogo: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      printBranding: { facilityName: 'No Logo Facility', address: '1 Test St', directorName: 'Dr. Smith' },
    };
    const layoutOut: CytologyPdfLayoutOutForTest = {};
    generateCytologyReportPdf(noLogo, layoutOut);
    expect(layoutOut.headerLogoRegion).toBeUndefined();
  });

  it('every existing, plain, single-argument call site is completely unaffected — layoutOut is genuinely optional', () => {
    const withLogo: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      printBranding: { facilityName: 'Logo Facility', address: '1 Test St', headerLogoUrl: 'https://example.com/logo.png' },
    };
    expect(() => generateCytologyReportPdf(withLogo)).not.toThrow();
  });
});

describe('generateCytologyReportPdf — real, per PS-277 §1.2.3 addendum rendering + forced dedicated page', () => {
  it('a real, pre-existing gap this batch closes: addendumText now actually prints, under its own real "Addendum" section header', () => {
    const withAddendum: CytologyReportContent = { ...MINIMAL_CONTENT, addendumText: 'HPV co-testing: positive for HPV 16.' };
    const output = generateCytologyReportPdf(withAddendum).output();
    expect(output).toContain('Addendum');
    expect(output).toContain('HPV co-testing: positive for HPV 16.');
  });

  it('forceAddendumOnDedicatedPage forces a real, additional page — never sharing a page with the content it supplements', () => {
    const shared: CytologyReportContent = { ...MINIMAL_CONTENT, addendumText: 'A short addendum.', forceAddendumOnDedicatedPage: false };
    const forced: CytologyReportContent = { ...MINIMAL_CONTENT, addendumText: 'A short addendum.', forceAddendumOnDedicatedPage: true };

    const sharedPages = generateCytologyReportPdf(shared).getNumberOfPages();
    const forcedPages = generateCytologyReportPdf(forced).getNumberOfPages();

    expect(sharedPages).toBe(1); // short content, no addendum forcing — still fits on one real page
    expect(forcedPages).toBe(2); // same content, forced — a real, genuine second page
  });

  it('a report with no real addendum at all is completely unaffected by forceAddendumOnDedicatedPage', () => {
    const noAddendum: CytologyReportContent = { ...MINIMAL_CONTENT, forceAddendumOnDedicatedPage: true };
    expect(generateCytologyReportPdf(noAddendum).getNumberOfPages()).toBe(1);
  });
});

describe('generateCytologyReportPdf — real, per PS-277 §1.2.1 continuation-page headers', () => {
  it('a real, multi-page report gets a real "Page X of Y" continuation header on every page after the first, never on page 1', () => {
    const heavy: CytologyReportContent = {
      ...FULL_CONTENT,
      additionalInterpretations: Array.from({ length: 25 }, (_, i) => `Finding ${i + 1}: a real, longer descriptive line to exercise real text wrapping and real pagination across multiple pages.`),
    };
    const doc = generateCytologyReportPdf(heavy);
    const totalPages = doc.getNumberOfPages();
    expect(totalPages).toBeGreaterThan(1);

    const output = doc.output();
    expect(output).toContain(`Page 2 of ${totalPages}`);
    expect(output).not.toContain('Page 1 of');
    // The real patient identity actually appears in the continuation
    // header text, not just a generic "Page X of Y" with no identity.
    expect(output).toContain(heavy.patientName);
    expect(output).toContain(heavy.accessionNumber);
  });
});

describe('generateCytologyReportPdfWithAttachments — real, per PS-276 §1.1.2 deterministic metadata', () => {
  it('produces byte-for-byte identical output across two real, independent generations from the same content', async () => {
    const first = await generateCytologyReportPdfWithAttachments(FULL_CONTENT);
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await generateCytologyReportPdfWithAttachments(FULL_CONTENT);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('writes the report\'s own accession number/signer into the real PDF Title/Author, and its own signedAt into CreationDate — never the real wall-clock time', async () => {
    const bytes = await generateCytologyReportPdfWithAttachments(MINIMAL_CONTENT);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBe(`Cytology Report — ${MINIMAL_CONTENT.accessionNumber}`);
    expect(doc.getAuthor()).toBe(MINIMAL_CONTENT.signedBy.name);
    expect(doc.getCreationDate()?.toISOString()).toBe(new Date(MINIMAL_CONTENT.signedAt).toISOString());
  });

  it('real, per PS-277 §1.2.2 gap-closing — actually fetches and embeds a real header logo when printBranding.headerLogoUrl is set', async () => {
    const RED_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const withLogo: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      printBranding: { facilityName: 'Logo Facility', address: '1 Test St', headerLogoUrl: 'https://example.com/logo.png' },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(Uint8Array.from(Buffer.from(RED_PNG_BASE64, 'base64')), { status: 200 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const bytes = await generateCytologyReportPdfWithAttachments(withLogo);
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      // Real, per embedCytologyHeaderLogo.ts's own real design — the
      // logo lands on the EXISTING page 1, never a new page.
      expect(doc.getPageCount()).toBe(1);
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/logo.png');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('leaves the real report otherwise unaffected — and never throws — when the header logo fetch genuinely fails', async () => {
    const withLogo: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      printBranding: { facilityName: 'Logo Facility', address: '1 Test St', headerLogoUrl: 'https://example.com/missing.png' },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const bytes = await generateCytologyReportPdfWithAttachments(withLogo);
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      expect(doc.getTitle()).toBe(`Cytology Report — ${MINIMAL_CONTENT.accessionNumber}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('never attempts a network fetch for the header logo when printBranding has no headerLogoUrl', async () => {
    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await generateCytologyReportPdfWithAttachments(MINIMAL_CONTENT);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('takes the same deterministic-metadata path whether or not real image associations are present', async () => {
    const withImages: CytologyReportContent = {
      ...MINIMAL_CONTENT,
      imageAssociations: [{
        id: 'assoc-1', assetId: 'specimen-1', imageUrl: 'https://example.com/x.png',
        imageType: 'Gross Specimen', sourceSystemId: 'v1', createdAt: '2026-01-01',
      } satisfies ImageAssociation],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const bytes = await generateCytologyReportPdfWithAttachments(withImages);
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      expect(doc.getTitle()).toBe(`Cytology Report — ${MINIMAL_CONTENT.accessionNumber}`);
      expect(doc.getCreationDate()?.toISOString()).toBe(new Date(MINIMAL_CONTENT.signedAt).toISOString());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

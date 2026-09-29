// src/services/documentRendering/applyContinuationPageHeaders.test.ts
import { describe, it, expect, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { applyContinuationPageHeaders, CONTINUATION_HEADER_HEIGHT_MM } from './applyContinuationPageHeaders';
import { registerEmbeddedPrintFont } from './registerEmbeddedPrintFont';

// Real, per PS-276 §1.1.1 gap-closing — applyContinuationPageHeaders()
// now draws with the real, embedded print font instead of jsPDF's
// built-in 'helvetica', so every real test doc here must register it
// first, exactly like generateCytologyReportPdf.ts's own real caller
// always does on the same doc instance before this function ever runs.

const LAYOUT = { marginMm: 15, pageWidthMm: 210 };
const IDENTITY = { patientName: 'Angela Torres', patientMrn: '100502', accessionNumber: 'S26-5002-CYT-001' };

// Real, deliberate: spies on THIS instance's own real 'text' method —
// jsPDF attaches plugin methods per-instance, never on the shared
// prototype (vi.spyOn(jsPDF.prototype, 'text') genuinely fails here,
// confirmed directly), same real instance-spy pattern already
// established in drawBarcodeOnJsPdfDoc.test.ts.
function spyOnText(doc: jsPDF) {
  return vi.spyOn(doc, 'text');
}

describe('applyContinuationPageHeaders — real, per PS-277 §1.2.1', () => {
  it('a real, single-page doc is left completely untouched — no continuation header on the only page', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    registerEmbeddedPrintFont(doc);
    const textSpy = spyOnText(doc);
    applyContinuationPageHeaders(doc, IDENTITY, LAYOUT);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('a real, 3-page doc gets the abbreviated header on pages 2 and 3, never page 1', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    registerEmbeddedPrintFont(doc);
    doc.addPage();
    doc.addPage();
    const textSpy = spyOnText(doc);

    applyContinuationPageHeaders(doc, IDENTITY, LAYOUT);

    const drawnLines = textSpy.mock.calls.map(call => call[0]);
    expect(drawnLines).toContain('Angela Torres · MRN 100502 · Accession: S26-5002-CYT-001 · Page 2 of 3');
    expect(drawnLines).toContain('Angela Torres · MRN 100502 · Accession: S26-5002-CYT-001 · Page 3 of 3');
    expect(drawnLines.some(l => l.includes('Page 1 of'))).toBe(false);
  });

  it('a patient with no real MRN on record omits the MRN segment entirely, never a blank placeholder', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    registerEmbeddedPrintFont(doc);
    doc.addPage();
    const textSpy = spyOnText(doc);

    applyContinuationPageHeaders(doc, { patientName: 'Jane Doe', accessionNumber: 'S26-0001' }, LAYOUT);

    expect(textSpy.mock.calls[0][0]).toBe('Jane Doe · Accession: S26-0001 · Page 2 of 2');
  });

  it('leaves the caller a real, documented amount of reserved space to lay out around', () => {
    expect(CONTINUATION_HEADER_HEIGHT_MM).toBeGreaterThan(0);
  });
});

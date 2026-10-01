// src/services/labelDesigner/buildLabelLayoutZpl.test.ts
import { describe, it, expect } from 'vitest';
import { buildLabelLayoutZpl } from './buildLabelLayoutZpl';
import type { LabelLayout } from './ILabelLayoutService';

const DPI = 203;

function makeLayout(fields: LabelLayout['fields']): LabelLayout {
  return { id: 'l-1', labelType: 'requisition', widthMm: 50.8, heightMm: 25.4, fields, updatedAt: '2026-09-08T00:00:00.000Z' };
}

describe('buildLabelLayoutZpl — real, per direct follow-up: "add a way for users to output their label so they can verify that they will work"', () => {
  it('real, a genuinely empty layout still produces valid, real ZPL start/end commands', () => {
    const zpl = buildLabelLayoutZpl(makeLayout([]), 'requisition', {}, DPI);
    expect(zpl).toContain('^XA');
    expect(zpl).toContain('^XZ');
  });

  it('real, a plain text field renders as a real ^FO + ^A0N + ^FD command, using the field\'s own real, saved position and font size', () => {
    const layout = makeLayout([{ id: 'f1', fieldKey: 'patientName', xMm: 5, yMm: 10, widthMm: 30, heightMm: 6, fontSizeMm: 2.6 }]);
    const zpl = buildLabelLayoutZpl(layout, 'requisition', { patientName: 'Maria Garcia' }, DPI);
    const xDots = Math.round((5 / 25.4) * DPI);
    const yDots = Math.round((10 / 25.4) * DPI);
    const fontDots = Math.round((2.6 / 25.4) * DPI);
    expect(zpl).toContain(`^FO${xDots},${yDots}^A0N,${fontDots},${fontDots}^FDMaria Garcia^FS`);
  });

  it('real, a missing sample value correctly falls back to the real field key itself, never a blank or fabricated value', () => {
    const layout = makeLayout([{ id: 'f1', fieldKey: 'someUnmappedField', xMm: 0, yMm: 0, widthMm: 20, heightMm: 6, fontSizeMm: 2.6 }]);
    const zpl = buildLabelLayoutZpl(layout, 'requisition', {}, DPI);
    expect(zpl).toContain('someUnmappedField');
  });

  it('real, the barcode field for a "code128" label type (requisition) renders a real ^BCN command, not a plain text field', () => {
    const layout = makeLayout([{ id: 'f1', fieldKey: 'barcode', xMm: 5, yMm: 5, widthMm: 40, heightMm: 12, fontSizeMm: 2.6 }]);
    const zpl = buildLabelLayoutZpl(layout, 'requisition', { barcode: 'DVMC26-0001' }, DPI);
    expect(zpl).toContain('^BCN,');
    expect(zpl).toContain('^FDDVMC26-0001^FS');
    expect(zpl).not.toContain('^A0N'); // real, never rendered as a plain text field
  });

  it('real, the barcode field for a "datamatrix" label type (specimen) renders a real ^BXN command', () => {
    const layout = makeLayout([{ id: 'f1', fieldKey: 'barcode', xMm: 5, yMm: 5, widthMm: 20, heightMm: 20, fontSizeMm: 2.6 }]);
    const zpl = buildLabelLayoutZpl(layout, 'specimen', { barcode: 'SPEC-20260906-00000042' }, DPI);
    expect(zpl).toContain('^BXN,');
  });

  it('real, block and slide (GS1 label types) also resolve to a real datamatrix export, matching their own real production symbology', () => {
    const layout = makeLayout([{ id: 'f1', fieldKey: 'barcode', xMm: 5, yMm: 5, widthMm: 15, heightMm: 15, fontSizeMm: 2.6 }]);
    expect(buildLabelLayoutZpl(layout, 'block', { barcode: 'DVMC26-0001' }, DPI)).toContain('^BXN,');
    expect(buildLabelLayoutZpl(layout, 'slide', { barcode: 'DVMC26-0001' }, DPI)).toContain('^BXN,');
  });

  it('real, molecular_plate and molecular_rack (medium_container preset) resolve to a real code128 export', () => {
    const layout = makeLayout([{ id: 'f1', fieldKey: 'barcode', xMm: 5, yMm: 5, widthMm: 40, heightMm: 15, fontSizeMm: 2.6 }]);
    expect(buildLabelLayoutZpl(layout, 'molecular_plate', { barcode: 'PLT-HPV-20260906-012' }, DPI)).toContain('^BCN,');
    expect(buildLabelLayoutZpl(layout, 'molecular_rack', { barcode: 'RACK-MOLE-00007' }, DPI)).toContain('^BCN,');
  });

  it('real, multiple fields (text + barcode) on the same layout all render together, in real, saved field order', () => {
    const layout = makeLayout([
      { id: 'f1', fieldKey: 'barcode', xMm: 2, yMm: 2, widthMm: 30, heightMm: 12, fontSizeMm: 2.6 },
      { id: 'f2', fieldKey: 'patientName', xMm: 2, yMm: 16, widthMm: 30, heightMm: 6, fontSizeMm: 2.6 },
    ]);
    const zpl = buildLabelLayoutZpl(layout, 'requisition', { barcode: 'DVMC26-0001', patientName: 'Maria Garcia' }, DPI);
    const barcodeIdx = zpl.indexOf('^BCN,');
    const nameIdx = zpl.indexOf('Maria Garcia');
    expect(barcodeIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeGreaterThan(barcodeIdx);
  });

  it('real, a genuinely different real dpi produces genuinely different real dot coordinates for the same real mm position', () => {
    const layout = makeLayout([{ id: 'f1', fieldKey: 'patientName', xMm: 10, yMm: 10, widthMm: 30, heightMm: 6, fontSizeMm: 2.6 }]);
    const zpl203 = buildLabelLayoutZpl(layout, 'requisition', { patientName: 'X' }, 203);
    const zpl300 = buildLabelLayoutZpl(layout, 'requisition', { patientName: 'X' }, 300);
    expect(zpl203).not.toBe(zpl300);
  });
});

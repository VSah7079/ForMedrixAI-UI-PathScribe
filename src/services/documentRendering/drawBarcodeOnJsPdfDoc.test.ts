// src/services/documentRendering/drawBarcodeOnJsPdfDoc.test.ts
import { describe, it, expect, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { drawBarcodeOnJsPdfDoc } from './drawBarcodeOnJsPdfDoc';
import { resolveBarcodeVectorSpec } from './resolveBarcodeVectorSpec';

describe('drawBarcodeOnJsPdfDoc — real vector drawing onto a jsPDF doc', () => {
  it('draws exactly one filled rect per real Code 128 bar, all within the given placement box', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const rectSpy = vi.spyOn(doc, 'rect');
    const spec = resolveBarcodeVectorSpec('S26-5002', 'code128');
    if (spec.kind !== 'linear') throw new Error('expected linear');

    drawBarcodeOnJsPdfDoc(doc, 'S26-5002', 'code128', { x: 100, y: 10, widthMm: 40, heightMm: 8 });

    expect(rectSpy).toHaveBeenCalledTimes(spec.bars.length);
    for (const call of rectSpy.mock.calls) {
      const [x, y, w, h, style] = call;
      expect(style).toBe('F');
      expect(x).toBeGreaterThanOrEqual(100);
      expect(x + w).toBeLessThanOrEqual(100 + 40 + 1e-9);
      expect(y).toBe(10);
      expect(h).toBe(8);
    }
  });

  it('draws exactly one filled rect per true QR module, all within the given placement box', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const rectSpy = vi.spyOn(doc, 'rect');
    const spec = resolveBarcodeVectorSpec('S26-01', 'qr');
    if (spec.kind !== 'matrix') throw new Error('expected matrix');
    const trueModuleCount = spec.modules.flat().filter(Boolean).length;

    drawBarcodeOnJsPdfDoc(doc, 'S26-01', 'qr', { x: 5, y: 5, widthMm: 20, heightMm: 20 });

    expect(rectSpy).toHaveBeenCalledTimes(trueModuleCount);
    for (const [x, y, w, h] of rectSpy.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(y).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(x + w).toBeLessThanOrEqual(5 + 20 + 1e-9);
      expect(y + h).toBeLessThanOrEqual(5 + 20 + 1e-9);
    }
  });

  it('produces a real, non-empty PDF page after drawing — genuinely lands in the document, not a no-op', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const before = doc.output('arraybuffer').byteLength;
    drawBarcodeOnJsPdfDoc(doc, 'S26-5002', 'code128', { x: 100, y: 10, widthMm: 40, heightMm: 8 });
    const after = doc.output('arraybuffer').byteLength;
    expect(after).toBeGreaterThan(before);
  });

  it('propagates a genuine encoding failure rather than drawing a partial barcode', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    expect(() => drawBarcodeOnJsPdfDoc(doc, '', 'qr', { x: 5, y: 5, widthMm: 20, heightMm: 20 })).toThrow();
  });
});

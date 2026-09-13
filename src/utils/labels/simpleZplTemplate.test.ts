// src/utils/labels/simpleZplTemplate.test.ts
import { describe, it, expect } from 'vitest';
import { buildSimpleZplLabel, mmToDots } from './simpleZplTemplate';

const BASE_FIELDS = { dpi: 203, widthMm: 50.8, heightMm: 25.4 };

describe('mmToDots — real, per direct research on ZPL coordinate correctness', () => {
  it('correctly converts 1 inch (25.4mm) to exactly the given dpi at 203 dpi', () => {
    expect(mmToDots(25.4, 203)).toBe(203);
  });

  it('correctly converts the same real physical distance to a genuinely different dot count at 300 dpi', () => {
    expect(mmToDots(25.4, 300)).toBe(300);
  });
});

describe('buildSimpleZplLabel — real, per direct correction: every coordinate now derives from real dpi + physical mm, never a bare dot literal', () => {
  it('produces a real, well-formed ZPL label starting with ^XA and ending with ^XZ', () => {
    const zpl = buildSimpleZplLabel({ barcodePayload: 'SPEC-20260906-00000042', symbology: 'datamatrix', textLines: ['PS26-100452'], ...BASE_FIELDS });
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trim().endsWith('^XZ')).toBe(true);
  });

  it('a real Code128 label uses the real, correct ^BCN barcode command', () => {
    const zpl = buildSimpleZplLabel({ barcodePayload: 'PLT-HPV-20260906-012', symbology: 'code128', textLines: [], ...BASE_FIELDS });
    expect(zpl).toContain('^BCN');
  });

  it('a real DataMatrix label uses the real, correct ^BXN barcode command with ECC 200', () => {
    const zpl = buildSimpleZplLabel({ barcodePayload: 'SPEC-20260906-00000042', symbology: 'datamatrix', textLines: [], ...BASE_FIELDS });
    expect(zpl).toContain(',200,');
    expect(zpl).toContain('^BXN');
  });

  it('the real barcode payload is never GS1-encoded — no FNC1/^FH escape sequence appears anywhere', () => {
    const zpl = buildSimpleZplLabel({ barcodePayload: 'RACK-MOLE-00007', symbology: 'code128', textLines: [], ...BASE_FIELDS });
    expect(zpl).not.toContain('^FH');
    expect(zpl).toContain('RACK-MOLE-00007');
  });

  it('real, multiple text lines are each rendered as their own real ZPL text field', () => {
    const zpl = buildSimpleZplLabel({ barcodePayload: 'X', symbology: 'code128', textLines: ['Line One', 'Line Two'], ...BASE_FIELDS });
    expect(zpl).toContain('Line One');
    expect(zpl).toContain('Line Two');
  });

  it('a real, malicious ZPL command character in free text is sanitized, never allowed to inject a new command', () => {
    const zpl = buildSimpleZplLabel({ barcodePayload: 'X', symbology: 'code128', textLines: ['Evil^XZ^XAInjected'], ...BASE_FIELDS });
    expect(zpl).not.toContain('Evil^XZ^XAInjected');
    expect(zpl).toContain('EvilXZXAInjected');
  });

  it('a real, empty text line is correctly skipped, never producing an empty ZPL field', () => {
    const zpl = buildSimpleZplLabel({ barcodePayload: 'X', symbology: 'code128', textLines: ['Real Line', '', '   '], ...BASE_FIELDS });
    const fieldCount = (zpl.match(/\^A0N/g) ?? []).length;
    expect(fieldCount).toBe(1);
  });

  it('real, per direct correction: the SAME real label at a genuinely higher dpi produces genuinely larger dot coordinates for the same real physical position', () => {
    const zplLowDpi = buildSimpleZplLabel({ barcodePayload: 'X', symbology: 'code128', textLines: ['Line'], dpi: 203, widthMm: 50.8, heightMm: 25.4 });
    const zplHighDpi = buildSimpleZplLabel({ barcodePayload: 'X', symbology: 'code128', textLines: ['Line'], dpi: 300, widthMm: 50.8, heightMm: 25.4 });
    const originLow = zplLowDpi.match(/\^FO(\d+),(\d+)/)!;
    const originHigh = zplHighDpi.match(/\^FO(\d+),(\d+)/)!;
    expect(Number(originHigh[1])).toBeGreaterThan(Number(originLow[1]));
    expect(Number(originHigh[2])).toBeGreaterThan(Number(originLow[2]));
  });

  it('real, per direct correction: every real ^FO field origin stays within the real, physical label bounds converted to dots at the given dpi — nothing prints off the edge of the label', () => {
    const { dpi, widthMm, heightMm } = BASE_FIELDS;
    const zpl = buildSimpleZplLabel({ barcodePayload: 'SPEC-20260906-00000042', symbology: 'datamatrix', textLines: ['Line One', 'Line Two', 'Line Three'], dpi, widthMm, heightMm });
    const maxXDots = mmToDots(widthMm, dpi);
    const maxYDots = mmToDots(heightMm, dpi);
    const origins = [...zpl.matchAll(/\^FO(\d+),(\d+)/g)];
    expect(origins.length).toBeGreaterThan(0);
    for (const [, x, y] of origins) {
      expect(Number(x)).toBeLessThan(maxXDots);
      expect(Number(y)).toBeLessThan(maxYDots);
    }
  });

  it('real, per direct correction: a real, wider label (medium_container width) uses a real, wider Code128 bar setting than a real, narrow one', () => {
    const narrow = buildSimpleZplLabel({ barcodePayload: 'X', symbology: 'code128', textLines: [], dpi: 203, widthMm: 50.8, heightMm: 25.4 });
    const wide = buildSimpleZplLabel({ barcodePayload: 'X', symbology: 'code128', textLines: [], dpi: 203, widthMm: 76.2, heightMm: 50.8 });
    expect(narrow).toContain('^BY2');
    expect(wide).toContain('^BY3');
  });
});

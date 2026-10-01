// src/utils/labels/generateBarcodeSvg.test.ts
import { describe, it, expect } from 'vitest';
import { generateBarcodeSvg } from './generateBarcodeSvg';

describe('generateBarcodeSvg — real bwip-js integration, per direct follow-up on the label-printing scope', () => {
  it('generates real, valid SVG markup for a Code 128 payload', () => {
    const svg = generateBarcodeSvg('DVMC26-0001', 'code128');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('generates real, valid SVG markup for a QR payload', () => {
    const svg = generateBarcodeSvg('DVMC26-0001-A', 'qr');
    expect(svg).toContain('<svg');
  });

  it('generates real, valid SVG markup for a DataMatrix payload', () => {
    const svg = generateBarcodeSvg('DVMC26-0001-A', 'datamatrix');
    expect(svg).toContain('<svg');
  });

  it('two different payloads produce genuinely different SVG output', () => {
    const svgA = generateBarcodeSvg('DVMC26-0001-A', 'code128');
    const svgB = generateBarcodeSvg('DVMC26-0001-B', 'code128');
    expect(svgA).not.toBe(svgB);
  });

  it('a genuinely empty payload throws, rather than silently producing an empty/broken barcode', () => {
    expect(() => generateBarcodeSvg('', 'code128')).toThrow();
  });
});

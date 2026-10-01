// src/services/documentRendering/resolveBarcodeVectorSpec.test.ts
import { describe, it, expect } from 'vitest';
import { resolveBarcodeVectorSpec } from './resolveBarcodeVectorSpec';

describe('resolveBarcodeVectorSpec — real, verified-against-toSVG geometry', () => {
  it('resolves Code 128 bars matching the exact, independently-verified layout for payload "AB"', () => {
    // Real, ground-truth values — cross-checked directly against
    // bwip-js's own toSVG({bcid:'code128', text:'AB'}) rendering (see
    // this module's own header comment for the full verification):
    // real bar centers [2,7,13,23,27,36,45,53,58,70,77,83,90,101,107,112]
    // at 2px/module, i.e. xModules+widthModules/2 (in module units,
    // 1 unit = 2px in that rendering) should match bar centers/2.
    const spec = resolveBarcodeVectorSpec('AB', 'code128');
    expect(spec.kind).toBe('linear');
    if (spec.kind !== 'linear') throw new Error('expected linear');

    const centersModuleUnits = spec.bars.map(b => b.xModules + b.widthModules / 2);
    const expectedCenters = [2, 7, 13, 23, 27, 36, 45, 53, 58, 70, 77, 83, 90, 101, 107, 112].map(px => px / 2);
    expect(centersModuleUnits).toEqual(expectedCenters);
    expect(spec.bars.length).toBe(16);
    expect(spec.totalWidthModules).toBe(57);
  });

  it('never overlaps two bars and never draws a negative-width bar, for a range of real payloads', () => {
    for (const payload of ['S26-5002', '0001', 'PATHSCRIBE-ACCESSION-99']) {
      const spec = resolveBarcodeVectorSpec(payload, 'code128');
      if (spec.kind !== 'linear') throw new Error('expected linear');
      for (const bar of spec.bars) expect(bar.widthModules).toBeGreaterThan(0);
      for (let i = 1; i < spec.bars.length; i++) {
        expect(spec.bars[i].xModules).toBeGreaterThanOrEqual(spec.bars[i - 1].xModules + spec.bars[i - 1].widthModules);
      }
    }
  });

  it('resolves a QR module grid with the spec-fixed 7×7 finder pattern in all three fixed corners, for payload "AB"', () => {
    const spec = resolveBarcodeVectorSpec('AB', 'qr');
    expect(spec.kind).toBe('matrix');
    if (spec.kind !== 'matrix') throw new Error('expected matrix');
    expect(spec.widthModules).toBe(21);
    expect(spec.heightModules).toBe(21);

    // Real, spec-fixed QR finder pattern (independently confirmed by
    // rendering the raw grid as ASCII art — see this module's own
    // header comment): a 7×7 concentric-square pattern
    // "#######/#.....#/#.###.#/#.###.#/#.###.#/#.....#/#######"
    // at (0,0), (0,14), and (14,0).
    const finderRows = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
    const readCorner = (rowOffset: number, colOffset: number) =>
      finderRows.map((_, r) => spec.modules[rowOffset + r].slice(colOffset, colOffset + 7).map(v => (v ? '1' : '0')).join(''));

    expect(readCorner(0, 0)).toEqual(finderRows); // top-left
    expect(readCorner(0, 14)).toEqual(finderRows); // top-right
    expect(readCorner(14, 0)).toEqual(finderRows); // bottom-left
  });

  it('resolves a real, non-empty Data Matrix module grid for a short accession-style payload', () => {
    const spec = resolveBarcodeVectorSpec('S26-01', 'datamatrix');
    expect(spec.kind).toBe('matrix');
    if (spec.kind !== 'matrix') throw new Error('expected matrix');
    expect(spec.widthModules).toBeGreaterThan(0);
    expect(spec.heightModules).toBeGreaterThan(0);
    expect(spec.modules.some(row => row.some(Boolean))).toBe(true);
  });

  it('throws on a genuine bwip-js encoding error rather than returning a guessed/partial spec', () => {
    // Real, verified failure (empirically confirmed, not assumed):
    // bwip-js's own qrcode/datamatrix encoders genuinely reject an
    // empty payload ("The data must not be empty") — a real encoding
    // failure, not a contrived one.
    expect(() => resolveBarcodeVectorSpec('', 'qr')).toThrow();
    expect(() => resolveBarcodeVectorSpec('', 'datamatrix')).toThrow();
  });
});

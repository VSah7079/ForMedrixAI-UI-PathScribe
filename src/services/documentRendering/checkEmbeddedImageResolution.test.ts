// src/services/documentRendering/checkEmbeddedImageResolution.test.ts
import { describe, it, expect } from 'vitest';
import { checkEmbeddedImageResolution, MIN_REQUIRED_DPI } from './checkEmbeddedImageResolution';

describe('checkEmbeddedImageResolution — real, effective-DPI-at-printed-size check', () => {
  it('reports exactly 300 DPI as meeting the minimum (boundary is inclusive)', () => {
    // A 1200px-wide image printed at 4 inches (288pt) wide = exactly 300 DPI.
    const result = checkEmbeddedImageResolution(1200, 4 * 72);
    expect(result.dpi).toBe(300);
    expect(result.meetsMinimum).toBe(true);
  });

  it('flags a low-resolution image printed near its native size as below the minimum', () => {
    // A modest 300px-wide image printed at 2 inches (144pt) = 150 DPI.
    const result = checkEmbeddedImageResolution(300, 2 * 72);
    expect(result.dpi).toBe(150);
    expect(result.meetsMinimum).toBe(false);
  });

  it('passes a high-resolution image even when shrunk down substantially', () => {
    // A 4000px-wide raw photo shrunk to print at 3 inches (216pt) wide.
    const result = checkEmbeddedImageResolution(4000, 3 * 72);
    expect(result.dpi).toBeGreaterThan(MIN_REQUIRED_DPI);
    expect(result.meetsMinimum).toBe(true);
  });

  it('never divides by zero — a genuinely zero printed size resolves to Infinity DPI, still meeting the minimum', () => {
    const result = checkEmbeddedImageResolution(500, 0);
    expect(result.dpi).toBe(Infinity);
    expect(result.meetsMinimum).toBe(true);
  });
});

// src/services/cytology/resolveCisoeAAdequacyToBethesda.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCisoeAAdequacyToBethesda } from './resolveCisoeAAdequacyToBethesda';

describe('resolveCisoeAAdequacyToBethesda', () => {
  it('a real satisfactory tier maps to the real Bethesda satisfactory category', () => {
    expect(resolveCisoeAAdequacyToBethesda('satisfactory')).toBe('cyto-adeq-satisfactory');
  });

  it('a real suboptimal tier still maps to satisfactory — a technically-limited but still usable specimen, not inadequate', () => {
    expect(resolveCisoeAAdequacyToBethesda('suboptimal')).toBe('cyto-adeq-satisfactory');
  });

  it('a real unsatisfactory tier maps to the real Bethesda insufficient category — this is what drives isUnsatisfactory gating', () => {
    expect(resolveCisoeAAdequacyToBethesda('unsatisfactory')).toBe('cyto-adeq-processed-insufficient');
  });
});

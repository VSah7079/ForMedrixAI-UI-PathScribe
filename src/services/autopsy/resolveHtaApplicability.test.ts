import { describe, it, expect } from 'vitest';
import { resolveHtaApplicability } from './resolveHtaApplicability';
import type { Jurisdiction } from '@/types/systemConfig';

describe('resolveHtaApplicability', () => {
  it('is true for England & Wales and Northern Ireland — both real, governed by the same real Human Tissue Act 2004', () => {
    expect(resolveHtaApplicability('GB_EW')).toBe(true);
    expect(resolveHtaApplicability('GB_NIR')).toBe(true);
  });

  it('is true for Scotland, under its own real, separate Human Tissue (Scotland) Act 2006 — never conflated with the 2004 act above', () => {
    expect(resolveHtaApplicability('GB_SCT')).toBe(true);
  });

  it('is true for New Zealand, under the real Coroners Act 2006', () => {
    expect(resolveHtaApplicability('NZ')).toBe(true);
  });

  it('is false for every other real jurisdiction the uploaded spec never named as HTA-governed', () => {
    const nonHtaJurisdictions: Jurisdiction[] = ['US', 'CA', 'IE', 'AU', 'KR', 'BE', 'NL', 'DE', 'FR'];
    for (const j of nonHtaJurisdictions) {
      expect(resolveHtaApplicability(j)).toBe(false);
    }
  });
});

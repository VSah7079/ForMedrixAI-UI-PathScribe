// src/services/documentRendering/validatePrintLayoutGovernance.test.ts
import { describe, it, expect } from 'vitest';
import {
  ALLOWED_PRINT_FONTS, MIN_PRINT_MARGIN_MM, assertAllowedPrintFont, assertMinimumPrintMargin,
} from './validatePrintLayoutGovernance';

describe('assertAllowedPrintFont — real, per PS-277 §1.2.4', () => {
  it('never throws for any real font already on the allowlist', () => {
    for (const font of ALLOWED_PRINT_FONTS) {
      expect(() => assertAllowedPrintFont(font)).not.toThrow();
    }
  });

  it('throws a real, clear, actionable error for an unapproved font — never a silent drift', () => {
    expect(() => assertAllowedPrintFont('Comic Sans')).toThrow(/not on the real, approved print-font allowlist/);
  });
});

describe('assertMinimumPrintMargin — real, per PS-277 §1.2.4 (0.5in minimum)', () => {
  it('never throws at or above the real 0.5in/12.7mm minimum', () => {
    expect(() => assertMinimumPrintMargin(MIN_PRINT_MARGIN_MM)).not.toThrow();
    expect(() => assertMinimumPrintMargin(15)).not.toThrow(); // this app's own real, existing MARGIN constant
  });

  it('throws a real, clear error below the minimum — never a silently clipped physical print', () => {
    expect(() => assertMinimumPrintMargin(10)).toThrow(/0\.5in \(12\.7mm\) minimum/);
  });
});

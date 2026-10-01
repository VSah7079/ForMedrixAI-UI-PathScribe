// src/types/labels/LabelSizePreset.test.ts
import { describe, it, expect } from 'vitest';
import { LABEL_SIZE_PRESETS, getLabelSizePreset, mmToInches, DEFAULT_CONTAINER_LABEL_PRESET_ID, DEFAULT_REQUISITION_LABEL_PRESET_ID } from './LabelSizePreset';

describe('LABEL_SIZE_PRESETS — real, named standard sizes', () => {
  it('every preset has a genuinely unique id', () => {
    const ids = LABEL_SIZE_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the CLSI AUTO12 standard specimen preset is exactly 2.0in x 1.0in in real mm', () => {
    const preset = getLabelSizePreset('clsi_standard_specimen');
    expect(preset?.widthMm).toBeCloseTo(50.8, 5);
    expect(preset?.heightMm).toBeCloseTo(25.4, 5);
  });

  it('small, dense presets (at or below 50x25mm) default to a real 2D symbology', () => {
    const preset = getLabelSizePreset('clsi_standard_specimen');
    expect(preset?.defaultBarcodeSymbology).toBe('datamatrix');
  });

  it('larger presets default to Code 128', () => {
    const preset = getLabelSizePreset('large_container');
    expect(preset?.defaultBarcodeSymbology).toBe('code128');
  });

  it('the real default preset ids resolve to real, existing presets', () => {
    expect(getLabelSizePreset(DEFAULT_CONTAINER_LABEL_PRESET_ID)).toBeDefined();
    expect(getLabelSizePreset(DEFAULT_REQUISITION_LABEL_PRESET_ID)).toBeDefined();
  });
});

describe('getLabelSizePreset — real lookup, honest absence', () => {
  it('returns undefined for a genuinely unknown preset id, never a fabricated default', () => {
    expect(getLabelSizePreset('not_a_real_preset')).toBeUndefined();
  });
});

describe('mmToInches — pure, exact unit conversion, never a second stored representation', () => {
  it('converts a real, known mm value to the exact expected inches', () => {
    expect(mmToInches(50.8)).toBeCloseTo(2.0, 5);
    expect(mmToInches(25.4)).toBeCloseTo(1.0, 5);
  });

  it('converts 0mm to 0in', () => {
    expect(mmToInches(0)).toBe(0);
  });
});

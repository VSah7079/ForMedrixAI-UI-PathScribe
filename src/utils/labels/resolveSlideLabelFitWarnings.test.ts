import { describe, it, expect } from 'vitest';
import { resolveSlideLabelFitWarnings } from './resolveSlideLabelFitWarnings';
import type { SlideLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';

describe('resolveSlideLabelFitWarnings', () => {
  it('a real, generously-sized config (large face, small module/font) returns no warnings', () => {
    const config: SlideLabelLayoutConfig = { faceWidthMm: 20, faceHeightMm: 8, moduleSizeMm: 0.2, fontHeightMm: 1.2 };
    expect(resolveSlideLabelFitWarnings(config)).toEqual([]);
  });

  it('a real height overflow is caught', () => {
    const config: SlideLabelLayoutConfig = { faceWidthMm: 20, faceHeightMm: 3, moduleSizeMm: 0.2, fontHeightMm: 1.2 };
    const warnings = resolveSlideLabelFitWarnings(config);
    expect(warnings.some(w => w.kind === 'height_overflow')).toBe(true);
  });

  it('a real width overflow (barcode alone wider than the configured face) is caught independently of height', () => {
    const config: SlideLabelLayoutConfig = { faceWidthMm: 3, faceHeightMm: 8, moduleSizeMm: 0.2, fontHeightMm: 1.2 };
    const warnings = resolveSlideLabelFitWarnings(config);
    expect(warnings.some(w => w.kind === 'width_overflow')).toBe(true);
  });

  it('a real config with both problems returns both warnings, not just the first found', () => {
    const config: SlideLabelLayoutConfig = { faceWidthMm: 2, faceHeightMm: 2, moduleSizeMm: 0.4, fontHeightMm: 2 };
    const warnings = resolveSlideLabelFitWarnings(config);
    expect(warnings.length).toBe(2);
  });

  it('the shipped default slide layout passes its own real safety check', async () => {
    const { DEFAULT_SLIDE_LABEL_LAYOUT } = await import('@/services/printSettings/IPrintSettingsService');
    expect(resolveSlideLabelFitWarnings(DEFAULT_SLIDE_LABEL_LAYOUT)).toEqual([]);
  });
});

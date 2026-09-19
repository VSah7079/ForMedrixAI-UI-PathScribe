import { describe, it, expect } from 'vitest';
import { resolveCassetteLabelFitWarnings } from './resolveCassetteLabelFitWarning';
import type { CassetteLabelLayoutConfig } from '@/services/printSettings/IPrintSettingsService';

describe('resolveCassetteLabelFitWarnings', () => {
  it('a real, generously-sized config (large face, small module/font) returns no warnings', () => {
    const config: CassetteLabelLayoutConfig = { faceWidthMm: 50, faceHeightMm: 30, moduleSizeMm: 0.2, fontHeightMm: 1.5 };
    expect(resolveCassetteLabelFitWarnings(config)).toEqual([]);
  });

  it('a real height overflow (today\u2019s original, pre-correction assumption) is caught', () => {
    // Roughly the original, unvalidated cassette template's own real
    // implicit assumption before this fix — a real, confirmed case
    // that should now warn.
    const config: CassetteLabelLayoutConfig = { faceWidthMm: 28.2, faceHeightMm: 8.0, moduleSizeMm: 0.4, fontHeightMm: 2.0 };
    const warnings = resolveCassetteLabelFitWarnings(config);
    expect(warnings.some(w => w.kind === 'height_overflow')).toBe(true);
  });

  it('a real width overflow (barcode alone wider than the configured face) is caught independently of height', () => {
    const config: CassetteLabelLayoutConfig = { faceWidthMm: 5, faceHeightMm: 30, moduleSizeMm: 0.3, fontHeightMm: 1 };
    const warnings = resolveCassetteLabelFitWarnings(config);
    expect(warnings.some(w => w.kind === 'width_overflow')).toBe(true);
  });

  it('a real config with both problems returns both warnings, not just the first found', () => {
    const config: CassetteLabelLayoutConfig = { faceWidthMm: 5, faceHeightMm: 3, moduleSizeMm: 0.5, fontHeightMm: 2 };
    const warnings = resolveCassetteLabelFitWarnings(config);
    expect(warnings.length).toBe(2);
  });

  it('the shipped default config (45\u00b0 cassette) passes its own real safety check', async () => {
    const { DEFAULT_CASSETTE_LABEL_LAYOUT } = await import('@/services/printSettings/IPrintSettingsService');
    expect(resolveCassetteLabelFitWarnings(DEFAULT_CASSETTE_LABEL_LAYOUT)).toEqual([]);
  });
});

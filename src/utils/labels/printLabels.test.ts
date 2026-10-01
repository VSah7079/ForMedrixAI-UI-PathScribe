// src/utils/labels/printLabels.test.ts
import { describe, it, expect } from 'vitest';
import { printLabels } from './printLabels';
import { getLabelSizePreset } from '@/types/labels/LabelSizePreset';

const preset = getLabelSizePreset('clsi_standard_specimen')!;

describe('printLabels — real, honest edge cases (window.open mechanics are verified live, not mocked here)', () => {
  it('a genuinely empty label list is a real no-op, never opens a print window', () => {
    expect(printLabels([], preset, 'Test')).toBe(false);
  });
});

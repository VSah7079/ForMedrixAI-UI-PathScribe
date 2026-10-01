// src/services/batches/shouldAutoAppendControl.test.ts
import { describe, it, expect } from 'vitest';
import { shouldAutoAppendControl } from './shouldAutoAppendControl';

describe('shouldAutoAppendControl \u2014 real, per PS-289/PS-292\u2019s own two-toggle refinement', () => {
  it('both real toggles set true \u2014 should auto-append', () => {
    expect(shouldAutoAppendControl({ requiresTargetControl: true, allowControlAutoAppend: true })).toBe(true);
  });

  it('requires a control but auto-append is suppressed \u2014 a real, legitimate lab choice (internal tissue control / manual SOP), never auto-appended', () => {
    expect(shouldAutoAppendControl({ requiresTargetControl: true, allowControlAutoAppend: false })).toBe(false);
  });

  it('auto-append true but no real control requirement at all \u2014 meaningless combination, never appends', () => {
    expect(shouldAutoAppendControl({ requiresTargetControl: false, allowControlAutoAppend: true })).toBe(false);
  });

  it('neither field set (a real, unconfigured stain) \u2014 never appends', () => {
    expect(shouldAutoAppendControl({})).toBe(false);
  });
});

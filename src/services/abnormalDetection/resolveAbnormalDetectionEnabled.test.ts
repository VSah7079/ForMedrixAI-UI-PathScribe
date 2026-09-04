// src/services/abnormalDetection/resolveAbnormalDetectionEnabled.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAbnormalDetectionEnabled } from './resolveAbnormalDetectionEnabled';

describe('resolveAbnormalDetectionEnabled — the real PS-105 governance rule', () => {
  it('is disabled when enterprise is disabled, regardless of the facility\'s own value', () => {
    expect(resolveAbnormalDetectionEnabled(false, true)).toBe(false);
  });

  it('the real requirement this whole function exists for: enterprise-disabled cannot be overridden by an explicit facility-level true', () => {
    expect(resolveAbnormalDetectionEnabled(false, true)).toBe(false);
    expect(resolveAbnormalDetectionEnabled(false, undefined)).toBe(false);
    expect(resolveAbnormalDetectionEnabled(false, false)).toBe(false);
  });

  it('when enterprise is enabled, an explicit facility-level false further restricts it', () => {
    expect(resolveAbnormalDetectionEnabled(true, false)).toBe(false);
  });

  it('when enterprise is enabled, an explicit facility-level true keeps it enabled', () => {
    expect(resolveAbnormalDetectionEnabled(true, true)).toBe(true);
  });

  it('when enterprise is enabled and the facility has no explicit setting, it inherits the enterprise default', () => {
    expect(resolveAbnormalDetectionEnabled(true, undefined)).toBe(true);
  });
});

// src/services/cancerRegistry/resolveIcdOBehaviorCode.test.ts
import { describe, it, expect } from 'vitest';
import { resolveIcdOBehaviorCode } from './resolveIcdOBehaviorCode';

describe('resolveIcdOBehaviorCode — real, per WHO ICD-O-3 standard combined morphology/behavior form', () => {
  it('real, a genuine malignant primary-site code parses correctly', () => {
    expect(resolveIcdOBehaviorCode('8500/3')).toBe('3');
  });

  it('real, a genuine carcinoma-in-situ code parses correctly', () => {
    expect(resolveIcdOBehaviorCode('8077/2')).toBe('2');
  });

  it('real, the optional leading "M" prefix some real sources use is handled', () => {
    expect(resolveIcdOBehaviorCode('M8500/3')).toBe('3');
  });

  it('real, a benign code parses correctly', () => {
    expect(resolveIcdOBehaviorCode('8140/0')).toBe('0');
  });

  it('real, a genuinely malformed or non-ICD-O string never guesses a behavior digit', () => {
    expect(resolveIcdOBehaviorCode('C50.911')).toBeNull();
    expect(resolveIcdOBehaviorCode('not a code')).toBeNull();
    expect(resolveIcdOBehaviorCode('8500')).toBeNull();
  });
});

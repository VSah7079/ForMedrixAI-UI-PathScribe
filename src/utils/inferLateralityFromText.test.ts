// src/utils/inferLateralityFromText.test.ts
import { describe, it, expect } from 'vitest';
import { inferLateralityFromText } from './inferLateralityFromText';

describe('inferLateralityFromText — real fix, per direct report: "Left forearm skin excision... implied laterality... we do not default"', () => {
  it('the exact real-world case that prompted this: "Left forearm skin excision, pigmented lesion" infers Left', () => {
    expect(inferLateralityFromText('Left forearm skin excision, pigmented lesion')).toBe('Left');
  });

  it('infers Right from a real description', () => {
    expect(inferLateralityFromText('Right breast core needle biopsy')).toBe('Right');
  });

  it('infers Bilateral', () => {
    expect(inferLateralityFromText('Bilateral tonsillectomy specimens')).toBe('Bilateral');
  });

  it('infers Midline', () => {
    expect(inferLateralityFromText('Midline neck mass excision')).toBe('Midline');
  });

  it('is case-insensitive', () => {
    expect(inferLateralityFromText('LEFT forearm lesion')).toBe('Left');
    expect(inferLateralityFromText('right thigh biopsy')).toBe('Right');
  });

  it('a genuinely empty or missing description returns unspecified, never a guess', () => {
    expect(inferLateralityFromText('')).toBe('');
    expect(inferLateralityFromText(undefined)).toBe('');
    expect(inferLateralityFromText(null)).toBe('');
  });

  it('a description with no real laterality indicator returns unspecified', () => {
    expect(inferLateralityFromText('Gallbladder, cholecystectomy specimen')).toBe('');
  });

  it('a real, deliberate safety rule: never a bare substring match — "leftover" is not Left', () => {
    expect(inferLateralityFromText('Leftover tissue from prior submission')).toBe('');
  });

  it('never a bare substring match — "copyright" is not Right', () => {
    expect(inferLateralityFromText('See copyright notice on requisition form')).toBe('');
  });

  it('a real, deliberate safety rule: Left AND Right both present is a genuine ambiguity, never silently picks one', () => {
    expect(inferLateralityFromText('Left breast and right breast, two specimens')).toBe('');
  });

  it('Bilateral takes priority even if Left or Right also technically appear elsewhere in the text', () => {
    expect(inferLateralityFromText('Bilateral procedure, left side submitted first')).toBe('Bilateral');
  });
});

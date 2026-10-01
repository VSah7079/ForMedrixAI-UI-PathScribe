import { describe, it, expect } from 'vitest';
import { resolveSpecimenCollectionDisplay } from './resolveSpecimenCollectionDisplay';

describe('resolveSpecimenCollectionDisplay', () => {
  it('a real, present collection date is formatted normally, no disclaimer, in either context', () => {
    const coronial = resolveSpecimenCollectionDisplay('2026-01-15T10:30:00.000Z', 'US', 'coronial_report');
    expect(coronial.isMissing).toBe(false);
    expect(coronial.stabilityDisclaimer).toBeUndefined();
    expect(coronial.displayText).not.toBe('Date Not Provided');

    const general = resolveSpecimenCollectionDisplay('2026-01-15T10:30:00.000Z', 'US', 'general');
    expect(general.isMissing).toBe(false);
  });

  it('a genuinely missing date in a coronial report shows the real fallback text and a real stability disclaimer', () => {
    const result = resolveSpecimenCollectionDisplay(undefined, 'GB_EW', 'coronial_report');
    expect(result.isMissing).toBe(true);
    expect(result.displayText).toBe('Date Not Provided');
    expect(result.stabilityDisclaimer).toContain('cannot be verified');
  });

  it('a genuinely missing date in a general (non-coronial) context shows the fallback text but never a legal disclaimer', () => {
    const result = resolveSpecimenCollectionDisplay(undefined, 'GB_EW', 'general');
    expect(result.isMissing).toBe(true);
    expect(result.displayText).toBe('Date Not Provided');
    expect(result.stabilityDisclaimer).toBeUndefined();
  });
});

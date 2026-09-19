import { describe, it, expect } from 'vitest';
import { formatConsentingRelativePriorityHint } from './formatConsentingRelativePriorityHint';

describe('formatConsentingRelativePriorityHint', () => {
  it('a real jurisdiction with a defined order (US) formats a real, readable priority list', () => {
    const hint = formatConsentingRelativePriorityHint('US');
    expect(hint).toBe('Priority order for this jurisdiction: Spouse/Partner > Adult Child > Parent > Adult Sibling > Grandparent > Guardian at Death');
  });

  it('a real UK jurisdiction (GB_EW) formats its own, genuinely different HTA 2004 order', () => {
    const hint = formatConsentingRelativePriorityHint('GB_EW');
    expect(hint).toContain('Spouse/Partner > Parent or Child > Sibling');
  });

  it('a real jurisdiction with no defined order (e.g. GB_SCT, deliberately not modeled) returns undefined, never a fabricated hint', () => {
    expect(formatConsentingRelativePriorityHint('GB_SCT')).toBeUndefined();
  });
});

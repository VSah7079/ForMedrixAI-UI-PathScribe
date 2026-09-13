import { describe, it, expect } from 'vitest';
import { resolveConsentingRelativePriority, resolveHighestPriorityConsentingRelative } from './resolveConsentingRelativePriority';

describe('resolveConsentingRelativePriority', () => {
  it('a real US case returns the real, common UAGA-pattern order, spouse first', () => {
    const order = resolveConsentingRelativePriority('US');
    expect(order?.[0]).toBe('spouse_or_partner');
    expect(order).toEqual(['spouse_or_partner', 'adult_child', 'parent', 'adult_sibling', 'grandparent', 'guardian_at_death']);
  });

  it('England & Wales and Northern Ireland share the exact same real order, since both fall under the same real Human Tissue Act 2004', () => {
    const ew = resolveConsentingRelativePriority('GB_EW');
    const nir = resolveConsentingRelativePriority('GB_NIR');
    expect(ew).toEqual(nir);
    expect(ew?.[0]).toBe('spouse_or_partner');
    expect(ew?.[1]).toBe('parent_or_child');
  });

  it('a real NZ case returns the real Coroners Act 2006 order', () => {
    expect(resolveConsentingRelativePriority('NZ')).toEqual(['spouse_or_partner', 'parent', 'child', 'sibling']);
  });

  it('Scotland is deliberately undefined here \u2014 its own real, separate Human Tissue (Scotland) Act 2006 is not modeled by this function, an honest gap rather than an assumed match to HTA 2004', () => {
    expect(resolveConsentingRelativePriority('GB_SCT')).toBeUndefined();
  });

  it('every other real jurisdiction with no named priority system returns undefined, never a guessed order', () => {
    expect(resolveConsentingRelativePriority('CA')).toBeUndefined();
    expect(resolveConsentingRelativePriority('DE')).toBeUndefined();
    expect(resolveConsentingRelativePriority('KR')).toBeUndefined();
  });
});

describe('resolveHighestPriorityConsentingRelative', () => {
  it('a real spouse available always outranks a real adult child, in a real US case', () => {
    expect(resolveHighestPriorityConsentingRelative('US', ['adult_child', 'spouse_or_partner', 'parent'])).toBe('spouse_or_partner');
  });

  it('with no real spouse available, the next real, highest-ranked relationship actually present wins', () => {
    expect(resolveHighestPriorityConsentingRelative('US', ['grandparent', 'parent'])).toBe('parent');
  });

  it('returns undefined when none of the real, available relationships appear in the jurisdiction\u2019s own real order at all \u2014 e.g. a grandparent, which NZ\u2019s own real order never names', () => {
    expect(resolveHighestPriorityConsentingRelative('NZ', ['grandparent'])).toBeUndefined();
    expect(resolveHighestPriorityConsentingRelative('US', [])).toBeUndefined();
  });

  it('returns undefined for a real jurisdiction with no defined order, regardless of what is available', () => {
    expect(resolveHighestPriorityConsentingRelative('GB_SCT', ['spouse_or_partner'])).toBeUndefined();
  });
});

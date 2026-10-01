// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mockBillingTypeTriggerConfigService } from './mockBillingTypeTriggerConfigService';
import { BILLING_TYPE_DEFAULT_TRIGGER } from './codeMapTable';

describe('mockBillingTypeTriggerConfigService - the real, admin-configurable trigger override', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the real, existing default when no admin override has ever been saved', async () => {
    const res = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(BILLING_TYPE_DEFAULT_TRIGGER);
  });

  it('a real, saved override is genuinely returned by getEffectiveTriggerMap afterward', async () => {
    const override = { TC: 'CASE_SIGNED_OUT' as const, '26': 'CASE_SIGNED_OUT' as const, Global: 'CASE_SIGNED_OUT' as const };
    await mockBillingTypeTriggerConfigService.setTriggerOverride(override);
    const res = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(override);
  });

  it('resetToDefault genuinely clears a real, saved override', async () => {
    await mockBillingTypeTriggerConfigService.setTriggerOverride({ TC: 'CASE_SIGNED_OUT', '26': 'CASE_SIGNED_OUT', Global: 'CASE_SIGNED_OUT' });
    await mockBillingTypeTriggerConfigService.resetToDefault();
    const res = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(BILLING_TYPE_DEFAULT_TRIGGER);
  });

  it('a real, partial override (saved before a hypothetical future billingType existed) merges onto the default rather than losing it', async () => {
    localStorage.setItem('pathscribe_billing_type_trigger_override', JSON.stringify({ TC: 'CASE_SIGNED_OUT' }));
    const res = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.TC).toBe('CASE_SIGNED_OUT');
      expect(res.data['26']).toBe(BILLING_TYPE_DEFAULT_TRIGGER['26']);
      expect(res.data.Global).toBe(BILLING_TYPE_DEFAULT_TRIGGER.Global);
    }
  });
});

describe('mockBillingTypeTriggerConfigService — real, per-site overrides with enterprise fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('a site with no real, saved override of its own falls back to the enterprise-wide effective map', async () => {
    await mockBillingTypeTriggerConfigService.setTriggerOverride({ TC: 'CASE_SIGNED_OUT', '26': 'CASE_SIGNED_OUT', Global: 'CASE_SIGNED_OUT' });
    const res = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap('SITE-A');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.TC).toBe('CASE_SIGNED_OUT');
  });

  it('a real, saved site override takes precedence over the enterprise-wide default for that site only', async () => {
    await mockBillingTypeTriggerConfigService.setTriggerOverride({ TC: 'SPECIMEN_GROSSED', '26': 'SPECIMEN_GROSSED', Global: 'SPECIMEN_GROSSED' }, 'SITE-A');
    const siteRes = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap('SITE-A');
    expect(siteRes.ok).toBe(true);
    if (siteRes.ok) expect(siteRes.data.TC).toBe('SPECIMEN_GROSSED');

    // A different, real site is completely unaffected.
    const otherSiteRes = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap('SITE-B');
    expect(otherSiteRes.ok).toBe(true);
    if (otherSiteRes.ok) expect(otherSiteRes.data.TC).toBe(BILLING_TYPE_DEFAULT_TRIGGER.TC);

    // The real, enterprise-wide effective map (no siteId) is also unaffected.
    const enterpriseRes = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap();
    expect(enterpriseRes.ok).toBe(true);
    if (enterpriseRes.ok) expect(enterpriseRes.data.TC).toBe(BILLING_TYPE_DEFAULT_TRIGGER.TC);
  });

  it('a real, partial site override merges onto the enterprise-wide effective map, not just the bare default', async () => {
    await mockBillingTypeTriggerConfigService.setTriggerOverride({ TC: 'CASE_SIGNED_OUT', '26': 'CASE_SIGNED_OUT', Global: 'CASE_SIGNED_OUT' });
    await mockBillingTypeTriggerConfigService.setTriggerOverride({ TC: 'SPECIMEN_GROSSED', '26': 'CASE_SIGNED_OUT', Global: 'CASE_SIGNED_OUT' }, 'SITE-A');
    const res = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap('SITE-A');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.TC).toBe('SPECIMEN_GROSSED'); // the real site override
      expect(res.data['26']).toBe('CASE_SIGNED_OUT'); // inherited from the enterprise-wide override
    }
  });

  it('resetToDefault with a real siteId clears only that site\'s own override, reverting it to inherit enterprise-wide', async () => {
    await mockBillingTypeTriggerConfigService.setTriggerOverride({ TC: 'SPECIMEN_GROSSED', '26': 'SPECIMEN_GROSSED', Global: 'SPECIMEN_GROSSED' }, 'SITE-A');
    await mockBillingTypeTriggerConfigService.resetToDefault('SITE-A');
    const res = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap('SITE-A');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(BILLING_TYPE_DEFAULT_TRIGGER);
  });

  it('getSiteIdsWithOverrides genuinely lists only sites with a real, saved override of their own', async () => {
    await mockBillingTypeTriggerConfigService.setTriggerOverride({ TC: 'SPECIMEN_GROSSED', '26': 'SPECIMEN_GROSSED', Global: 'SPECIMEN_GROSSED' }, 'SITE-A');
    const res = await mockBillingTypeTriggerConfigService.getSiteIdsWithOverrides();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toContain('SITE-A');
      expect(res.data).not.toContain('SITE-B');
    }
  });
});

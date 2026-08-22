import { describe, it, expect, beforeEach } from 'vitest';
import { mockBillingRuleService } from './mockBillingRuleService';

// Real, minimal localStorage mock - same pattern as
// mockRvuCodeMapService.test.ts, this suite genuinely exercises the
// storage-backed service, not just pure functions.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockBillingRuleService — real, per-billingCode append-only versioning', () => {
  it('the real, initial migration seed is present for every existing billingCode', async () => {
    const res = await mockBillingRuleService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const codes = res.data.map(v => v.billingCode);
    expect(codes).toEqual(expect.arrayContaining(['IHC-FIRST', 'IHC-ADDL', 'PIN4-PANEL', 'FROZEN-FIRST', 'FROZEN-ADDL', 'SPECIAL-STAIN']));
  });

  it('resolves the real, active rule for a real billingCode on a real date of service', async () => {
    const res = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01');
    if (!res.ok) throw new Error('lookup failed');
    expect(res.data?.cpt).toBe('88342');
    expect(res.data?.version).toBe(1);
  });

  it('returns null, never a fabricated match, for a real date before any real version existed', async () => {
    const res = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2020-01-01');
    if (!res.ok) throw new Error('lookup failed');
    expect(res.data).toBeNull();
  });

  it('creates a real new version for an EXISTING billingCode as version 2, never overwriting version 1', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', effectiveFrom: '2027-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US',
      changeReason: 'CMS 2027 RVU update', approvedBy: 'admin-1',
      createdBy: 'test-admin',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version).toBe(2);

    const all = await mockBillingRuleService.getVersionsForBillingCode('IHC-FIRST');
    if (!all.ok) throw new Error('lookup failed');
    expect(all.data.map(v => v.version)).toEqual([1, 2]);
  });

  it('rejects a new version of an EXISTING billingCode with no real changeReason - real governance, not optional', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', effectiveFrom: '2027-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US',
      createdBy: 'test-admin',
    });
    expect(res.ok).toBe(false);
  });

  it('creates a genuinely BRAND NEW billingCode as version 1 without requiring a changeReason - no prior version to change FROM', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'NEW-CUSTOM-CODE', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '99999', country: 'US',
      createdBy: 'test-admin',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version).toBe(1);
  });

  it('rejects a new version with no real CPT code - never lets a customer invent their own CPT/HCPCS/RVU value', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'MADE-UP', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '', country: 'US',
      createdBy: 'test-admin',
    });
    expect(res.ok).toBe(false);
  });

  it('retiring a version marks it RETIRED and sets a real effectiveTo, without deleting it', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', effectiveFrom: '2027-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', changeReason: 'CMS 2027 update',
      createdBy: 'test-admin',
    });
    const retireRes = await mockBillingRuleService.retireVersion('IHC-FIRST', 1, '2026-12-31');
    expect(retireRes.ok).toBe(true);
    if (retireRes.ok) {
      expect(retireRes.data.status).toBe('RETIRED');
      expect(retireRes.data.effectiveTo).toBe('2026-12-31');
    }
    // still present, not deleted
    const all = await mockBillingRuleService.getVersionsForBillingCode('IHC-FIRST');
    if (!all.ok) throw new Error('lookup failed');
    expect(all.data).toHaveLength(2);
  });

  it('after a version is RETIRED with a real effectiveTo, a date within its old window no longer resolves at all (status checked independently — same as resolveBillingRuleAt), while a later date resolves to the new, ACTIVE version', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', effectiveFrom: '2027-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', changeReason: 'CMS 2027 update',
      createdBy: 'test-admin',
    });
    await mockBillingRuleService.retireVersion('IHC-FIRST', 1, '2026-12-31');
    const oldDateAfterRetirement = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01');
    if (!oldDateAfterRetirement.ok) throw new Error('lookup failed');
    expect(oldDateAfterRetirement.data).toBeNull();

    const newDate = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2027-06-01');
    if (!newDate.ok) throw new Error('lookup failed');
    expect(newDate.data?.version).toBe(2);
    expect(newDate.data?.rvuWork).toBe(0.75);
  });

  it('rejects retiring a real billingCode+version that does not exist', async () => {
    const res = await mockBillingRuleService.retireVersion('IHC-FIRST', 99, '2026-12-31');
    expect(res.ok).toBe(false);
  });

  it('the real IHC-ADDL/PIN4-PANEL/FROZEN-FIRST/FROZEN-ADDL seed entries honestly carry no RVU, matching the disclosed gap', async () => {
    const res = await mockBillingRuleService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const gapped = res.data.filter(v => ['IHC-ADDL', 'PIN4-PANEL', 'FROZEN-FIRST', 'FROZEN-ADDL'].includes(v.billingCode));
    expect(gapped).toHaveLength(4);
    gapped.forEach(v => expect(v.rvuWork).toBeUndefined());
  });

  it('a real site creating its FIRST override of an existing enterprise billingCode gets its OWN real version 1 - a genuinely new, independent sequence, no changeReason forced on it', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version).toBe(1);
  });

  it('getActiveRuleAt with a real siteId prefers that site\'s own override over the enterprise-wide rule', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    const siteResult = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01', 'site-MRI');
    const enterpriseResult = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01');
    if (!siteResult.ok || !enterpriseResult.ok) throw new Error('lookup failed');
    expect(siteResult.data?.rvuWork).toBe(0.75);
    expect(siteResult.data?.siteId).toBe('site-MRI');
    expect(enterpriseResult.data?.rvuWork).toBe(0.68); // unaffected — the enterprise row itself never changed
  });

  it('a DIFFERENT site with no override of its own still resolves the enterprise-wide rule via getActiveRuleAt', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    const res = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01', 'site-WYT');
    if (!res.ok) throw new Error('lookup failed');
    expect(res.data?.rvuWork).toBe(0.68); // enterprise fallback
    expect(res.data?.siteId).toBeUndefined();
  });

  it('getVersionsForBillingCode with a real siteId returns ONLY that site\'s own history, never merged with the enterprise one', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    const siteHistory = await mockBillingRuleService.getVersionsForBillingCode('IHC-FIRST', 'site-MRI');
    const enterpriseHistory = await mockBillingRuleService.getVersionsForBillingCode('IHC-FIRST');
    if (!siteHistory.ok || !enterpriseHistory.ok) throw new Error('lookup failed');
    expect(siteHistory.data).toHaveLength(1);
    expect(siteHistory.data[0].siteId).toBe('site-MRI');
    expect(enterpriseHistory.data).toHaveLength(1);
    expect(enterpriseHistory.data[0].siteId).toBeUndefined();
  });

  it('retiring a site-scoped version does not touch the enterprise-wide row for the same billingCode', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    const retireRes = await mockBillingRuleService.retireVersion('IHC-FIRST', 1, '2026-12-31', 'site-MRI');
    expect(retireRes.ok).toBe(true);
    const enterpriseRes = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01');
    if (!enterpriseRes.ok) throw new Error('lookup failed');
    expect(enterpriseRes.data?.status).toBe('ACTIVE'); // untouched
    expect(enterpriseRes.data?.rvuWork).toBe(0.68);
  });

  it('suppressionAdvisory is stored as real, plain data on a site override, never read or acted on by createVersion itself', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'SPECIAL-STAIN', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88312', rvuWork: 0.53, country: 'US', createdBy: 'test-admin',
      suppressionAdvisory: 'Bundled into base fee per local payer contract — do not bill separately',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.suppressionAdvisory).toBe('Bundled into base fee per local payer contract — do not bill separately');
  });
});

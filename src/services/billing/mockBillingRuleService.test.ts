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
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2027-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US',
      changeReason: 'CMS 2027 RVU update',
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
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2027-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US',
      createdBy: 'test-admin',
    });
    expect(res.ok).toBe(false);
  });

  it('creates a genuinely BRAND NEW billingCode as version 1 without requiring a changeReason - no prior version to change FROM', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'NEW-CUSTOM-CODE', level: 'specimen', billingType: 'Global', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '99999', country: 'US',
      createdBy: 'test-admin',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version).toBe(1);
  });

  it('rejects a new version with no real CPT code - never lets a customer invent their own CPT/HCPCS/RVU value', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'MADE-UP', level: 'specimen', billingType: 'Global', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '', country: 'US',
      createdBy: 'test-admin',
    });
    expect(res.ok).toBe(false);
  });

  it('retiring a version marks it RETIRED and sets a real effectiveTo, without deleting it', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2027-01-01', effectiveTo: null,
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
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2027-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', changeReason: 'CMS 2027 update',
      createdBy: 'test-admin',
    });
    if (!created.ok) throw new Error('setup failed');
    // Real, per direct guidance's own Four-Eyes Principle requirement:
    // a real new version starts as DRAFT and must genuinely go
    // through submit + a DIFFERENT reviewer's approval before it's
    // resolvable at all - it no longer goes live on create.
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'test-admin');
    await mockBillingRuleService.approveVersion('IHC-FIRST', created.data.version, undefined, 'test-reviewer');
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

  // Real, direct follow-up (PS-83): the gap this test originally locked in
  // is now half-closed, not fully open or fully closed. Version 1 (still
  // ACTIVE, still the version every real charge resolves against today)
  // honestly still carries no RVU - unchanged. Version 2 (PENDING_APPROVAL,
  // not yet live) carries a real, web-search-sourced RVU awaiting a real
  // reviewer's decision - same posture as the pre-existing 88307 example
  // this file already covers elsewhere, not a new pattern.
  it('the real IHC-ADDL/PIN4-PANEL/FROZEN-FIRST/FROZEN-ADDL seed entries: version 1 (ACTIVE) still honestly carries no RVU, version 2 (PENDING_APPROVAL) carries a real, unverified-pending-customer-review RVU', async () => {
    const res = await mockBillingRuleService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const gapCodes = ['IHC-ADDL', 'PIN4-PANEL', 'FROZEN-FIRST', 'FROZEN-ADDL'];
    const entries = res.data.filter(v => gapCodes.includes(v.billingCode));
    expect(entries).toHaveLength(8); // 4 codes x 2 versions each

    const v1 = entries.filter(v => v.version === 1);
    expect(v1).toHaveLength(4);
    v1.forEach(v => {
      expect(v.status).toBe('ACTIVE');
      expect(v.rvuWork).toBeUndefined();
    });

    const v2 = entries.filter(v => v.version === 2);
    expect(v2).toHaveLength(4);
    v2.forEach(v => {
      expect(v.status).toBe('PENDING_APPROVAL');
      expect(v.rvuWork).toBeGreaterThan(0);
      expect(v.changeReason).toMatch(/findacode\.com/);
    });
  });

  it('a real site creating its FIRST override of an existing enterprise billingCode gets its OWN real version 1 - a genuinely new, independent sequence, no changeReason forced on it', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version).toBe(1);
  });

  it('getActiveRuleAt with a real siteId prefers that site\'s own override over the enterprise-wide rule', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, 'site-MRI', 'test-admin');
    await mockBillingRuleService.approveVersion('IHC-FIRST', created.data.version, 'site-MRI', 'test-reviewer');
    const siteResult = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01', 'site-MRI');
    const enterpriseResult = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01');
    if (!siteResult.ok || !enterpriseResult.ok) throw new Error('lookup failed');
    expect(siteResult.data?.rvuWork).toBe(0.75);
    expect(siteResult.data?.siteId).toBe('site-MRI');
    expect(enterpriseResult.data?.rvuWork).toBe(0.68); // unaffected — the enterprise row itself never changed
  });

  it('a DIFFERENT site with no override of its own still resolves the enterprise-wide rule via getActiveRuleAt', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.75, country: 'US', createdBy: 'test-admin',
    });
    const res = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-06-01', 'site-WYT');
    if (!res.ok) throw new Error('lookup failed');
    expect(res.data?.rvuWork).toBe(0.68); // enterprise fallback
    expect(res.data?.siteId).toBeUndefined();
  });

  it('getVersionsForBillingCode with a real siteId returns ONLY that site\'s own history, never merged with the enterprise one', async () => {
    await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
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
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
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
      billingCode: 'SPECIAL-STAIN', level: 'specimen', billingType: 'Global', siteId: 'site-MRI', effectiveFrom: '2026-01-01', effectiveTo: null,
      cpt: '88312', rvuWork: 0.53, country: 'US', createdBy: 'test-admin',
      suppressionAdvisory: 'Bundled into base fee per local payer contract — do not bill separately',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.suppressionAdvisory).toBe('Bundled into base fee per local payer contract — do not bill separately');
  });
});

describe('mockBillingRuleService - PS-94 real Draft / Pending Approval / Approve / Reject lifecycle (Four-Eyes Principle)', () => {
  it('createVersion defaults to DRAFT, not ACTIVE, when no explicit status is given', async () => {
    const res = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe('DRAFT');
  });

  it('a real DRAFT is never resolvable by getActiveRuleAt, even for a date genuinely within its own effective window', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2028-06-01');
    if (!res.ok) throw new Error('lookup failed');
    expect(res.data?.version).not.toBe(created.data.version);
  });

  it('submitForApproval moves a real DRAFT to PENDING_APPROVAL and records who/when', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('PENDING_APPROVAL');
      expect(res.data.submittedForApprovalBy).toBe('drafter-1');
      expect(res.data.submittedForApprovalAt).toBeTruthy();
    }
  });

  it('rejects submitting a version that is not currently a real DRAFT', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    const res = await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    expect(res.ok).toBe(false);
  });

  it('Four-Eyes Principle: rejects approval when reviewedBy matches the real drafter (createdBy)', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    const res = await mockBillingRuleService.approveVersion('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    expect(res.ok).toBe(false);
  });

  it('Four-Eyes Principle: rejects approval when reviewedBy matches the real submitter, even if a different createdBy drafted it', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    // A real, different user submits the same draft on the drafter's behalf.
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'submitter-2');
    const res = await mockBillingRuleService.approveVersion('IHC-FIRST', created.data.version, undefined, 'submitter-2');
    expect(res.ok).toBe(false);
  });

  it('a real, genuinely different reviewer can approve, making the version ACTIVE and resolvable', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    const approveRes = await mockBillingRuleService.approveVersion('IHC-FIRST', created.data.version, undefined, 'reviewer-1');
    expect(approveRes.ok).toBe(true);
    if (approveRes.ok) {
      expect(approveRes.data.status).toBe('ACTIVE');
      expect(approveRes.data.reviewedBy).toBe('reviewer-1');
    }
    const resolved = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2028-06-01');
    if (!resolved.ok) throw new Error('lookup failed');
    expect(resolved.data?.version).toBe(created.data.version);
  });

  it('approving a real new version genuinely retires whichever version was previously ACTIVE in the same scope', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    await mockBillingRuleService.approveVersion('IHC-FIRST', created.data.version, undefined, 'reviewer-1');

    const all = await mockBillingRuleService.getVersionsForBillingCode('IHC-FIRST');
    if (!all.ok) throw new Error('lookup failed');
    const v1 = all.data.find(v => v.version === 1);
    expect(v1?.status).toBe('RETIRED');
    expect(v1?.effectiveTo).toBe('2028-01-01');
  });

  it('rejectVersion requires a real rejection reason', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    const res = await mockBillingRuleService.rejectVersion('IHC-FIRST', created.data.version, undefined, 'reviewer-1', '');
    expect(res.ok).toBe(false);
  });

  it('Four-Eyes Principle applies to rejection too - the real drafter cannot reject their own submission', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    const res = await mockBillingRuleService.rejectVersion('IHC-FIRST', created.data.version, undefined, 'drafter-1', 'Real reason');
    expect(res.ok).toBe(false);
  });

  it('a real, different reviewer can reject, and the rejected version stays permanently non-resolvable', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    await mockBillingRuleService.submitForApproval('IHC-FIRST', created.data.version, undefined, 'drafter-1');
    const res = await mockBillingRuleService.rejectVersion('IHC-FIRST', created.data.version, undefined, 'reviewer-1', 'RVU not verified against CMS source');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('REJECTED');
      expect(res.data.rejectionReason).toBe('RVU not verified against CMS source');
    }
    const resolved = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2028-06-01');
    if (!resolved.ok) throw new Error('lookup failed');
    expect(resolved.data?.version).not.toBe(created.data.version);
  });

  it('rejects approving/rejecting a version that is not currently real PENDING_APPROVAL', async () => {
    const created = await mockBillingRuleService.createVersion({
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', effectiveFrom: '2028-01-01', effectiveTo: null,
      cpt: '88342', rvuWork: 0.80, country: 'US', changeReason: 'Real test change', createdBy: 'drafter-1',
    });
    if (!created.ok) throw new Error('setup failed');
    // Still DRAFT - never submitted.
    const approveRes = await mockBillingRuleService.approveVersion('IHC-FIRST', created.data.version, undefined, 'reviewer-1');
    expect(approveRes.ok).toBe(false);
    const rejectRes = await mockBillingRuleService.rejectVersion('IHC-FIRST', created.data.version, undefined, 'reviewer-1', 'x');
    expect(rejectRes.ok).toBe(false);
  });
});

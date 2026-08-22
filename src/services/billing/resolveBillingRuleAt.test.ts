import { describe, it, expect } from 'vitest';
import { resolveBillingRuleAt } from './resolveBillingRuleAt';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';

function makeVersion(over: Partial<BillingRuleVersion> = {}): BillingRuleVersion {
  return {
    billingCode: 'IHC-FIRST', version: 1,
    effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE',
    cpt: '88342', rvuWork: 0.68,
    createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system',
    ...over,
  };
}

describe('resolveBillingRuleAt — real, exact algorithm per direct guidance', () => {
  it('resolves the one real, open-ended (effectiveTo: null) version for a date after its effectiveFrom', () => {
    const versions = [makeVersion()];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions);
    expect(result?.version).toBe(1);
    expect(result?.cpt).toBe('88342');
  });

  it('returns null for a date BEFORE the version\'s effectiveFrom - not yet in effect', () => {
    const versions = [makeVersion({ effectiveFrom: '2026-01-01' })];
    const result = resolveBillingRuleAt('IHC-FIRST', '2025-12-31', versions);
    expect(result).toBeNull();
  });

  it('returns null for a date AFTER the version\'s effectiveTo - no longer in effect', () => {
    const versions = [makeVersion({ effectiveTo: '2026-06-30' })];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-07-01', versions);
    expect(result).toBeNull();
  });

  it('the real point of this whole model: once a version is RETIRED, an old date within its window resolves to nothing (see the next test for why), while a later date correctly resolves to the newer, ACTIVE version', () => {
    const versions = [
      makeVersion({ version: 1, effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30', status: 'RETIRED', rvuWork: 0.68 }),
      makeVersion({ version: 2, effectiveFrom: '2026-07-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.75 }),
    ];
    const early = resolveBillingRuleAt('IHC-FIRST', '2026-03-01', versions);
    const late = resolveBillingRuleAt('IHC-FIRST', '2026-08-01', versions);
    expect(early).toBeNull(); // RETIRED is never selected — see the dedicated test below for why this is deliberate
    expect(late?.version).toBe(2);
    expect(late?.rvuWork).toBe(0.75);
  });

  it('a RETIRED version is never selected, even for a date genuinely inside its own effectiveFrom/effectiveTo window - status is checked independently of the date window', () => {
    const versions = [makeVersion({ status: 'RETIRED', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' })];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-03-01', versions);
    expect(result).toBeNull();
  });

  it('a different billingCode never matches, regardless of date', () => {
    const versions = [makeVersion({ billingCode: 'IHC-FIRST' })];
    const result = resolveBillingRuleAt('IHC-ADDL', '2026-06-01', versions);
    expect(result).toBeNull();
  });

  it('when two ACTIVE versions genuinely overlap (shouldn\'t happen with correctly governed data), the higher version number wins', () => {
    const versions = [
      makeVersion({ version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.68 }),
      makeVersion({ version: 2, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.75 }),
    ];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions);
    expect(result?.version).toBe(2);
  });

  it('returns null, never a fabricated match, when no real version exists for this billingCode at all', () => {
    const result = resolveBillingRuleAt('NOT-A-REAL-CODE', '2026-06-01', [makeVersion()]);
    expect(result).toBeNull();
  });

  it('returns null for an invalid date string rather than throwing', () => {
    const result = resolveBillingRuleAt('IHC-FIRST', 'not-a-real-date', [makeVersion()]);
    expect(result).toBeNull();
  });

  it('a version\'s own effectiveFrom date is inclusive - the exact boundary date resolves', () => {
    const versions = [makeVersion({ effectiveFrom: '2026-01-01' })];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-01-01', versions);
    expect(result).not.toBeNull();
  });

  it('a version\'s own effectiveTo date is inclusive - the exact boundary date still resolves', () => {
    const versions = [makeVersion({ effectiveTo: '2026-06-30' })];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-06-30', versions);
    expect(result).not.toBeNull();
  });
});

describe('resolveBillingRuleAt — real, two-tier site scoping, per direct, explicit guidance', () => {
  it('with no siteId given, resolves the enterprise-wide (siteId: undefined) row exactly as before site scoping existed', () => {
    const versions = [makeVersion({ siteId: undefined, rvuWork: 0.68 })];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions);
    expect(result?.rvuWork).toBe(0.68);
  });

  it('a real site override, when it covers the date, wins over the enterprise-wide row for that same site', () => {
    const versions = [
      makeVersion({ siteId: undefined, version: 1, rvuWork: 0.68 }),
      makeVersion({ siteId: 'site-MRI', version: 1, rvuWork: 0.75 }),
    ];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions, 'site-MRI');
    expect(result?.rvuWork).toBe(0.75);
    expect(result?.siteId).toBe('site-MRI');
  });

  it('a DIFFERENT site with no override of its own still falls back correctly to the enterprise-wide row', () => {
    const versions = [
      makeVersion({ siteId: undefined, version: 1, rvuWork: 0.68 }),
      makeVersion({ siteId: 'site-MRI', version: 1, rvuWork: 0.75 }),
    ];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions, 'site-WYT');
    expect(result?.rvuWork).toBe(0.68);
    expect(result?.siteId).toBeUndefined();
  });

  it('one site\'s own override version history is real and independent of another site\'s, even for the same billingCode', () => {
    const versions = [
      makeVersion({ siteId: 'site-MRI', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88342', rvuWork: 0.75 }),
      makeVersion({ siteId: 'site-WYT', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88342', rvuWork: 0.80 }),
    ];
    const mri = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions, 'site-MRI');
    const wyt = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions, 'site-WYT');
    expect(mri?.rvuWork).toBe(0.75);
    expect(wyt?.rvuWork).toBe(0.80);
  });

  it('a site\'s own override version history is genuinely independent of the enterprise row\'s version numbers - a site can be on its own v1 while the enterprise row is on v3', () => {
    const versions = [
      makeVersion({ siteId: undefined, version: 1, effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31', status: 'RETIRED' }),
      makeVersion({ siteId: undefined, version: 2, effectiveFrom: '2026-04-01', effectiveTo: '2026-06-30', status: 'RETIRED' }),
      makeVersion({ siteId: undefined, version: 3, effectiveFrom: '2026-07-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.90 }),
      makeVersion({ siteId: 'site-MRI', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.75 }),
    ];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-08-01', versions, 'site-MRI');
    expect(result?.version).toBe(1); // the site's own v1, not the enterprise row's v3
    expect(result?.rvuWork).toBe(0.75);
  });

  it('a site override that does not itself cover this date of service correctly falls back to the enterprise row, not to nothing', () => {
    const versions = [
      makeVersion({ siteId: undefined, version: 1, effectiveFrom: '2025-01-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.68 }),
      makeVersion({ siteId: 'site-MRI', version: 1, effectiveFrom: '2027-01-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.75 }), // not yet in effect
    ];
    const result = resolveBillingRuleAt('IHC-FIRST', '2026-06-01', versions, 'site-MRI');
    expect(result?.rvuWork).toBe(0.68); // fell back to the enterprise row
    expect(result?.siteId).toBeUndefined();
  });
});

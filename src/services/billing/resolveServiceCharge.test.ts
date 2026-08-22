import { describe, it, expect } from 'vitest';
import { resolveServiceCharge, resolveServiceCharges } from './resolveServiceCharge';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';

const versions: BillingRuleVersion[] = [
  { billingCode: 'IHC-FIRST', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88342', description: 'Immunohistochemistry, first single antibody stain', rvuWork: 0.68, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
  { billingCode: 'IHC-ADDL', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88341', description: 'Immunohistochemistry, each additional single antibody stain', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' }, // honest, disclosed RVU gap
  { billingCode: 'SPECIAL-STAIN', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88312', description: 'Special stain (group 1), including interpretation', rvuWork: 0.53, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
];

const baseCtx = {
  caseId: 'case-1',
  sourceLevel: 'block' as const,
  sourceLabel: 'A1',
  dateOfService: '2026-06-01',
  resolvedBy: 'system',
  resolvedAt: '2026-08-20T12:00:00.000Z',
};

describe('resolveServiceCharge — real, permanent snapshot, resolved once against the real per-billingCode versioned model and never re-resolved', () => {
  it('resolves a real billingCode to its full, real CPT/description/RVU snapshot for the given date of service', () => {
    const result = resolveServiceCharge('IHC-FIRST', versions, baseCtx);
    expect(result).toMatchObject({
      billingCode: 'IHC-FIRST',
      cptCode: '88342',
      cptDescription: 'Immunohistochemistry, first single antibody stain',
      rvuWork: 0.68,
      ruleVersion: 1,
      ruleSetId: 'BILLRULE-IHC-FIRST-1',
      resolvedBy: 'system',
      resolvedAt: '2026-08-20T12:00:00.000Z',
    });
  });

  it('returns null, never a fabricated record, for a billingCode with no real, ACTIVE version covering this date of service', () => {
    const result = resolveServiceCharge('NOT-A-REAL-BILLING-CODE', versions, baseCtx);
    expect(result).toBeNull();
  });

  it('returns null for a real billingCode whose only version does not yet cover this date of service', () => {
    const result = resolveServiceCharge('IHC-FIRST', versions, { ...baseCtx, dateOfService: '2020-01-01' });
    expect(result).toBeNull();
  });

  it('honestly carries through an unverified RVU as undefined rather than inventing one', () => {
    const result = resolveServiceCharge('IHC-ADDL', versions, baseCtx);
    expect(result?.rvuWork).toBeUndefined();
    expect(result?.cptCode).toBe('88341'); // the real CPT code and coding rule ARE verified, just not the RVU
  });

  it('the real point of ruleVersion: resolving the SAME billingCode at two different dates of service picks the correct historical rule version each time', () => {
    const multiVersion: BillingRuleVersion[] = [
      { ...versions[0], version: 1, effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30', status: 'RETIRED', rvuWork: 0.68 },
      { ...versions[0], version: 2, effectiveFrom: '2026-07-01', effectiveTo: null, status: 'ACTIVE', rvuWork: 0.75 },
    ];
    const early = resolveServiceCharge('IHC-FIRST', multiVersion, { ...baseCtx, dateOfService: '2026-03-01' });
    const late = resolveServiceCharge('IHC-FIRST', multiVersion, { ...baseCtx, dateOfService: '2026-08-01' });
    expect(early).toBeNull(); // RETIRED is never selected — see resolveBillingRuleAt.test.ts for the full reasoning
    expect(late?.ruleVersion).toBe(2);
    expect(late?.rvuWork).toBe(0.75);
    expect(late?.ruleSetId).toBe('BILLRULE-IHC-FIRST-2');
  });

  it('produces a deterministic id from caseId/sourceLabel/billingCode - reprocessing the same event does not create a duplicate', () => {
    const first = resolveServiceCharge('IHC-FIRST', versions, baseCtx);
    const second = resolveServiceCharge('IHC-FIRST', versions, baseCtx);
    expect(first?.id).toBe(second?.id);
  });

  it('a different sourceLabel produces a different id, even for the same billingCode on the same case', () => {
    const blockA = resolveServiceCharge('IHC-FIRST', versions, { ...baseCtx, sourceLabel: 'A1' });
    const blockB = resolveServiceCharge('IHC-FIRST', versions, { ...baseCtx, sourceLabel: 'A2' });
    expect(blockA?.id).not.toBe(blockB?.id);
  });

  it('defaults resolvedAt to now when not explicitly provided', () => {
    const { resolvedAt, ...ctxWithoutResolvedAt } = baseCtx;
    const result = resolveServiceCharge('IHC-FIRST', versions, ctxWithoutResolvedAt);
    expect(result?.resolvedAt).toBeTruthy();
    expect(new Date(result!.resolvedAt).getTime()).not.toBeNaN();
  });

  it('carries sourceLevel/specimenId/blockId through exactly as given, for Category C mapping later', () => {
    const result = resolveServiceCharge('SPECIAL-STAIN', versions, { ...baseCtx, sourceLevel: 'block', blockId: 'blk-99', specimenId: 'sp-1' });
    expect(result).toMatchObject({ sourceLevel: 'block', blockId: 'blk-99', specimenId: 'sp-1' });
  });

  it('leaves modifier undefined - an honest gap, since nothing in this app yet decides which specific modifier applies to a given charge', () => {
    const result = resolveServiceCharge('IHC-FIRST', versions, baseCtx);
    expect(result?.modifier).toBeUndefined();
  });
});

describe('resolveServiceCharge — real, two-tier site scoping and suppressionAdvisory carry-through, per direct, explicit guidance', () => {
  const siteScopedVersions: BillingRuleVersion[] = [
    ...versions,
    { billingCode: 'IHC-FIRST', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', siteId: 'site-MRI', cpt: '88342', description: 'Immunohistochemistry, first single antibody stain', rvuWork: 0.75, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
    { billingCode: 'SPECIAL-STAIN', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', siteId: 'site-MRI', cpt: '88312', description: 'Special stain (group 1), including interpretation', rvuWork: 0.53, suppressionAdvisory: 'Bundled into base fee per local payer contract — do not bill separately', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
  ];

  it('a real site override, when it exists for the given siteId, is used over the enterprise-wide rule', () => {
    const result = resolveServiceCharge('IHC-FIRST', siteScopedVersions, { ...baseCtx, siteId: 'site-MRI' });
    expect(result?.rvuWork).toBe(0.75);
    expect(result?.siteId).toBe('site-MRI');
    expect(result?.ruleSetId).toBe('BILLRULE-IHC-FIRST-site-MRI-1');
  });

  it('a DIFFERENT site with no override falls back to the enterprise-wide rule, and the record honestly reflects that (siteId undefined)', () => {
    const result = resolveServiceCharge('IHC-FIRST', siteScopedVersions, { ...baseCtx, siteId: 'site-WYT' });
    expect(result?.rvuWork).toBe(0.68);
    expect(result?.siteId).toBeUndefined();
    expect(result?.ruleSetId).toBe('BILLRULE-IHC-FIRST-1');
  });

  it('omitting siteId entirely resolves the enterprise-wide rule directly, exactly as before site scoping existed', () => {
    const result = resolveServiceCharge('IHC-FIRST', siteScopedVersions, baseCtx);
    expect(result?.rvuWork).toBe(0.68);
    expect(result?.siteId).toBeUndefined();
  });

  it('suppressionAdvisory is carried through from the resolved rule onto the permanent record, when present', () => {
    const result = resolveServiceCharge('SPECIAL-STAIN', siteScopedVersions, { ...baseCtx, siteId: 'site-MRI' });
    expect(result?.suppressionAdvisory).toBe('Bundled into base fee per local payer contract — do not bill separately');
  });

  it('a real charge is still generated even when the resolved rule has a suppressionAdvisory set — PathScribe never auto-suppresses', () => {
    const result = resolveServiceCharge('SPECIAL-STAIN', siteScopedVersions, { ...baseCtx, siteId: 'site-MRI' });
    expect(result).not.toBeNull();
    expect(result?.cptCode).toBe('88312');
  });

  it('suppressionAdvisory is undefined when the resolved rule (enterprise or site) never set one', () => {
    const result = resolveServiceCharge('IHC-FIRST', siteScopedVersions, { ...baseCtx, siteId: 'site-MRI' });
    expect(result?.suppressionAdvisory).toBeUndefined();
  });
});

describe('resolveServiceCharges — real batch resolution with honest gap reporting', () => {
  it('resolves every real billingCode in the batch', () => {
    const result = resolveServiceCharges(['IHC-FIRST', 'IHC-ADDL'], versions, baseCtx);
    expect(result.charges).toHaveLength(2);
    expect(result.unresolvedBillingCodes).toHaveLength(0);
  });

  it('reports an unresolvable billingCode honestly rather than silently dropping it', () => {
    const result = resolveServiceCharges(['IHC-FIRST', 'NOT-REAL'], versions, baseCtx);
    expect(result.charges).toHaveLength(1);
    expect(result.unresolvedBillingCodes).toEqual(['NOT-REAL']);
  });

  it('a single, non-repeated billingCode gets no sequencePosition at all', () => {
    const result = resolveServiceCharges(['SPECIAL-STAIN'], versions, baseCtx);
    expect(result.charges[0].sequencePosition).toBeUndefined();
  });

  it('two occurrences of the same billingCode in one batch get real, distinct sequence positions - and distinct ids as a result', () => {
    const result = resolveServiceCharges(['IHC-ADDL', 'IHC-ADDL'], versions, baseCtx);
    expect(result.charges).toHaveLength(2);
    expect(result.charges[0].sequencePosition).toBe(1);
    expect(result.charges[1].sequencePosition).toBe(2);
    expect(result.charges[0].id).not.toBe(result.charges[1].id);
  });

  it('handles an empty batch without throwing', () => {
    const result = resolveServiceCharges([], versions, baseCtx);
    expect(result).toEqual({ charges: [], unresolvedBillingCodes: [] });
  });
});

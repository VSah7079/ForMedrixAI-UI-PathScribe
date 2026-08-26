import { describe, it, expect } from 'vitest';
import { resolveServiceCharge, resolveServiceCharges, reverseServiceCharge, buildCorrectedServiceCharge } from './resolveServiceCharge';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';

const versions: BillingRuleVersion[] = [
  { billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88342', description: 'Immunohistochemistry, first single antibody stain', rvuWork: 0.68, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
  { billingCode: 'IHC-ADDL', level: 'specimen', billingType: 'Global', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88341', description: 'Immunohistochemistry, each additional single antibody stain', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' }, // honest, disclosed RVU gap
  { billingCode: 'SPECIAL-STAIN', level: 'specimen', billingType: 'Global', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88312', description: 'Special stain (group 1), including interpretation', rvuWork: 0.53, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
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
      billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global',
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
    { billingCode: 'IHC-FIRST', level: 'specimen', billingType: 'Global', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', siteId: 'site-MRI', cpt: '88342', description: 'Immunohistochemistry, first single antibody stain', rvuWork: 0.75, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
    { billingCode: 'SPECIAL-STAIN', level: 'specimen', billingType: 'Global', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', siteId: 'site-MRI', cpt: '88312', description: 'Special stain (group 1), including interpretation', rvuWork: 0.53, suppressionAdvisory: 'Bundled into base fee per local payer contract — do not bill separately', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
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

describe('reverseServiceCharge — real, exact reversal of an actual prior charge', () => {
  const original: ServiceChargeRecord = {
    id: 'chg-88305-1', caseId: 'CASE-1', transactionType: 'charge',
    sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'sp-1',
    billingCode: 'GROSS-STD', cptCode: '88305', level: 'specimen', billingType: 'Global',
    ruleVersion: 2, resolvedAt: '2026-08-01T00:00:00.000Z', resolvedBy: 'system',
  };

  it('produces a real credit copying the original\'s resolved values verbatim, not re-resolving them', () => {
    const credit = reverseServiceCharge(original, 'user-billing-1');
    expect(credit.transactionType).toBe('credit');
    expect(credit.cptCode).toBe('88305');
    expect(credit.ruleVersion).toBe(2);
    expect(credit.reversesTransactionId).toBe('chg-88305-1');
    expect(credit.resolvedBy).toBe('user-billing-1');
  });

  it('the credit gets a real, distinct id from the original charge', () => {
    const credit = reverseServiceCharge(original, 'user-billing-1');
    expect(credit.id).not.toBe(original.id);
  });

  it('uses a real, explicit reversedAt when given, rather than always defaulting to now', () => {
    const credit = reverseServiceCharge(original, 'user-billing-1', '2026-08-10T00:00:00.000Z');
    expect(credit.resolvedAt).toBe('2026-08-10T00:00:00.000Z');
  });
});

describe('buildCorrectedServiceCharge — the real CODE_CORRECTED fix: an actual new charge, not just a resolved label', () => {
  const original: ServiceChargeRecord = {
    id: 'chg-88307-1', caseId: 'CASE-1', transactionType: 'charge',
    sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'sp-1',
    billingCode: 'GROSS-COMPLEX', cptCode: '88307', cptDescription: 'Complex gross exam', level: 'specimen', billingType: 'Global',
    ruleVersion: 2, resolvedAt: '2026-08-01T00:00:00.000Z', resolvedBy: 'system',
  };

  it('produces a real, new charge (not a credit) carrying the real, corrected cptCode', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-billing-1');
    expect(corrected.transactionType).toBe('charge');
    expect(corrected.cptCode).toBe('88305');
    expect(corrected.reversesTransactionId).toBeUndefined();
  });

  it('never carries forward the old code\'s own cptDescription - that described the wrong code', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-billing-1');
    expect(corrected.cptDescription).toBeUndefined();
  });

  it('marks resolvedBy as the real, human corrector - never system, honestly distinguishing a manual correction', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-billing-1');
    expect(corrected.resolvedBy).toBe('user-billing-1');
  });

  it('gets a real, distinct id from the original - never collides with it or with a credit\'s own id scheme', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-billing-1');
    const credit = reverseServiceCharge(original, 'user-billing-1');
    expect(corrected.id).not.toBe(original.id);
    expect(corrected.id).not.toBe(credit.id);
  });

  it('preserves billingCode/ruleVersion/siteId from the original - still the same billing item, only its resolved CPT was wrong', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-billing-1');
    expect(corrected.billingCode).toBe('GROSS-COMPLEX');
    expect(corrected.ruleVersion).toBe(2);
  });

  it('uses a real, explicit correctedAt when given, rather than always defaulting to now', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-billing-1', '2026-08-12T00:00:00.000Z');
    expect(corrected.resolvedAt).toBe('2026-08-12T00:00:00.000Z');
  });
});

describe('reverseServiceCharge / buildCorrectedServiceCharge — real post-signout change context', () => {
  const original: ServiceChargeRecord = {
    id: 'chg-postsignout-1', caseId: 'CASE-1', transactionType: 'charge',
    sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'sp-1',
    billingCode: 'GROSS-COMPLEX', cptCode: '88307', level: 'specimen', billingType: 'Global',
    ruleVersion: 1, resolvedAt: '2026-08-01T00:00:00.000Z', resolvedBy: 'system',
  };
  const context = { reasonId: 'psbc-coding-error', comment: 'Payer rejected 88307 for this specimen type.' };

  it('reverseServiceCharge carries the real postSignoutChangeReasonId/Comment when given', () => {
    const credit = reverseServiceCharge(original, 'user-1', undefined, context);
    expect(credit.postSignoutChangeReasonId).toBe('psbc-coding-error');
    expect(credit.postSignoutChangeComment).toBe('Payer rejected 88307 for this specimen type.');
  });

  it('reverseServiceCharge never fabricates this context when none is given - the normal, pre-signout path', () => {
    const credit = reverseServiceCharge(original, 'user-1');
    expect(credit.postSignoutChangeReasonId).toBeUndefined();
    expect(credit.postSignoutChangeComment).toBeUndefined();
  });

  it('buildCorrectedServiceCharge carries the real postSignoutChangeReasonId/Comment when given', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-1', undefined, context);
    expect(corrected.postSignoutChangeReasonId).toBe('psbc-coding-error');
    expect(corrected.postSignoutChangeComment).toBe('Payer rejected 88307 for this specimen type.');
  });

  it('buildCorrectedServiceCharge never fabricates this context when none is given', () => {
    const corrected = buildCorrectedServiceCharge(original, '88305', 'user-1');
    expect(corrected.postSignoutChangeReasonId).toBeUndefined();
    expect(corrected.postSignoutChangeComment).toBeUndefined();
  });
});

describe('resolveServiceCharge — real, per direct follow-up: CPT modifier auto-append (-TC/-26)', () => {
  const modifierVersions: BillingRuleVersion[] = [
    { billingCode: 'GROSS-TC', level: 'specimen', billingType: 'TC', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88305', description: 'Technical component', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
    { billingCode: 'INTERP-26', level: 'specimen', billingType: '26', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88305', description: 'Professional component', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
    { billingCode: 'COMBINED-GLOBAL', level: 'specimen', billingType: 'Global', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE', cpt: '88305', description: 'Global (combined)', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' },
  ];

  it('a TC (Technical Component) charge is automatically appended with -TC', () => {
    const result = resolveServiceCharge('GROSS-TC', modifierVersions, baseCtx);
    expect(result?.modifier).toBe('-TC');
  });

  it('a 26 (Professional Component) charge is automatically appended with -26', () => {
    const result = resolveServiceCharge('INTERP-26', modifierVersions, baseCtx);
    expect(result?.modifier).toBe('-26');
  });

  it('a Global (combined) charge gets no modifier at all - not -TC, not -26, not fabricated', () => {
    const result = resolveServiceCharge('COMBINED-GLOBAL', modifierVersions, baseCtx);
    expect(result?.modifier).toBeUndefined();
  });
});

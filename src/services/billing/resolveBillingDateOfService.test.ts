import { describe, it, expect } from 'vitest';
import { resolveBillingDateOfService } from './resolveBillingDateOfService';

const base = {
  collectionDate: '2026-08-01T00:00:00.000Z',
  signOutDate: '2026-08-05T00:00:00.000Z',
  accessionDate: '2026-08-02T00:00:00.000Z',
};

describe('resolveBillingDateOfService - real country defaults, per the worked research', () => {
  it('US defaults to COLLECTION_DATE', () => {
    const result = resolveBillingDateOfService({ ...base, country: 'US' });
    expect(result.ruleApplied).toBe('COLLECTION_DATE');
    expect(result.billingDOS).toBe(base.collectionDate);
  });

  it('AU defaults to COLLECTION_DATE', () => {
    const result = resolveBillingDateOfService({ ...base, country: 'AU' });
    expect(result.ruleApplied).toBe('COLLECTION_DATE');
    expect(result.billingDOS).toBe(base.collectionDate);
  });

  it('CA defaults to ACCESSION_DATE', () => {
    const result = resolveBillingDateOfService({ ...base, country: 'CA' });
    expect(result.ruleApplied).toBe('ACCESSION_DATE');
    expect(result.billingDOS).toBe(base.accessionDate);
  });

  it('UK defaults to SIGNOUT_DATE (the disclosed NHS-costing default)', () => {
    const result = resolveBillingDateOfService({ ...base, country: 'UK' });
    expect(result.ruleApplied).toBe('SIGNOUT_DATE');
    expect(result.billingDOS).toBe(base.signOutDate);
  });

  it('an unresolvable country still resolves via the same safe default as US/AU, never throws', () => {
    const result = resolveBillingDateOfService({ ...base });
    expect(result.ruleApplied).toBe('COLLECTION_DATE');
  });
});

describe('resolveBillingDateOfService - real site-level override always wins', () => {
  it('a UK site explicitly configured for COLLECTION_DATE (the real, disclosed private-insurance case) overrides the NHS default', () => {
    const result = resolveBillingDateOfService({ ...base, country: 'UK', siteOverrideRule: 'COLLECTION_DATE' });
    expect(result.ruleApplied).toBe('COLLECTION_DATE');
    expect(result.billingDOS).toBe(base.collectionDate);
  });

  it('a US site explicitly configured for ACCESSION_DATE overrides the collection-date default', () => {
    const result = resolveBillingDateOfService({ ...base, country: 'US', siteOverrideRule: 'ACCESSION_DATE' });
    expect(result.ruleApplied).toBe('ACCESSION_DATE');
    expect(result.billingDOS).toBe(base.accessionDate);
  });
});

describe('resolveBillingDateOfService - never fabricates a date when the resolved rule\'s own input is missing', () => {
  it('SIGNOUT_DATE rule with no real signOutDate yet resolves to undefined, not a substituted date', () => {
    const result = resolveBillingDateOfService({ country: 'UK', collectionDate: base.collectionDate, accessionDate: base.accessionDate });
    expect(result.ruleApplied).toBe('SIGNOUT_DATE');
    expect(result.billingDOS).toBeUndefined();
  });
});

describe('resolveBillingDateOfService - the real US 14-day rule advisory, matching CMS\'s own policy exactly', () => {
  const discharge = '2026-07-01T00:00:00.000Z';
  const orderedWellAfter = '2026-07-20T00:00:00.000Z'; // 19 days post-discharge
  const orderedTooSoon = '2026-07-05T00:00:00.000Z'; // 4 days post-discharge
  const orderedExactly14 = '2026-07-15T00:00:00.000Z'; // exactly 14 days post-discharge

  it('advisory fires when the real, single criterion is met: ordered >=14 days post-discharge', () => {
    const result = resolveBillingDateOfService({
      country: 'US', collectionDate: base.collectionDate,
      dischargeTime: discharge, orderedAt: orderedWellAfter,
    });
    expect(result.us14DayRuleAdvisory?.criterionMet).toBe(true);
    expect(result.billingDOS).toBe(base.collectionDate);
  });

  it('fires at exactly 14 days, matching "at least 14 days" from the real CMS policy text', () => {
    const result = resolveBillingDateOfService({
      country: 'US', collectionDate: base.collectionDate,
      dischargeTime: discharge, orderedAt: orderedExactly14,
    });
    expect(result.us14DayRuleAdvisory?.criterionMet).toBe(true);
  });

  it('no advisory when the order was placed too soon after discharge', () => {
    const result = resolveBillingDateOfService({
      country: 'US', collectionDate: base.collectionDate,
      dischargeTime: discharge, orderedAt: orderedTooSoon,
    });
    expect(result.us14DayRuleAdvisory).toBeUndefined();
  });

  it('no advisory when either real date input is missing', () => {
    expect(resolveBillingDateOfService({ country: 'US', collectionDate: base.collectionDate, orderedAt: orderedWellAfter }).us14DayRuleAdvisory).toBeUndefined();
    expect(resolveBillingDateOfService({ country: 'US', collectionDate: base.collectionDate, dischargeTime: discharge }).us14DayRuleAdvisory).toBeUndefined();
  });

  it('never fires for a non-US country, even with the criterion satisfied', () => {
    const result = resolveBillingDateOfService({
      country: 'AU', collectionDate: base.collectionDate,
      dischargeTime: discharge, orderedAt: orderedWellAfter,
    });
    expect(result.us14DayRuleAdvisory).toBeUndefined();
  });

  it('never fires when a site override moves the rule away from COLLECTION_DATE', () => {
    const result = resolveBillingDateOfService({
      country: 'US', siteOverrideRule: 'ACCESSION_DATE', ...base,
      dischargeTime: discharge, orderedAt: orderedWellAfter,
    });
    expect(result.us14DayRuleAdvisory).toBeUndefined();
  });
});

describe('checkMolecularPathologyDosException - the real, separate 42 CFR 414.510(b)(5) exception', () => {
  const admit = '2026-07-01T00:00:00.000Z';
  const discharge = '2026-07-03T00:00:00.000Z';
  const collectedDuringStay = '2026-07-02T00:00:00.000Z';
  const collectedBeforeAdmit = '2026-06-25T00:00:00.000Z';
  const performedAfterDischarge = '2026-07-10T00:00:00.000Z';
  const performedBeforeDischarge = '2026-07-02T12:00:00.000Z';

  it('advisory fires when the two real, checkable halves are met and the code is flagged eligible', async () => {
    const { checkMolecularPathologyDosException } = await import('./resolveBillingDateOfService');
    const result = checkMolecularPathologyDosException({
      dosExceptionEligible: true, encounterClass: 'Outpatient',
      admitTime: admit, dischargeTime: discharge,
      collectionDate: collectedDuringStay, performedDate: performedAfterDischarge,
    });
    expect(result?.structuralCriteriaMet).toBe(true);
  });

  it('never fires when the billingCode was not confirmed eligible by a real coder', async () => {
    const { checkMolecularPathologyDosException } = await import('./resolveBillingDateOfService');
    const result = checkMolecularPathologyDosException({
      dosExceptionEligible: false, encounterClass: 'Outpatient',
      admitTime: admit, dischargeTime: discharge,
      collectionDate: collectedDuringStay, performedDate: performedAfterDischarge,
    });
    expect(result).toBeUndefined();
  });

  it('never fires for an inpatient encounter - this exception requires a genuine outpatient encounter', async () => {
    const { checkMolecularPathologyDosException } = await import('./resolveBillingDateOfService');
    const result = checkMolecularPathologyDosException({
      dosExceptionEligible: true, encounterClass: 'Inpatient',
      admitTime: admit, dischargeTime: discharge,
      collectionDate: collectedDuringStay, performedDate: performedAfterDischarge,
    });
    expect(result).toBeUndefined();
  });

  it('never fires when the test was performed before discharge', async () => {
    const { checkMolecularPathologyDosException } = await import('./resolveBillingDateOfService');
    const result = checkMolecularPathologyDosException({
      dosExceptionEligible: true, encounterClass: 'Outpatient',
      admitTime: admit, dischargeTime: discharge,
      collectionDate: collectedDuringStay, performedDate: performedBeforeDischarge,
    });
    expect(result).toBeUndefined();
  });

  it('never fires when the specimen was collected outside the real encounter window', async () => {
    const { checkMolecularPathologyDosException } = await import('./resolveBillingDateOfService');
    const result = checkMolecularPathologyDosException({
      dosExceptionEligible: true, encounterClass: 'Outpatient',
      admitTime: admit, dischargeTime: discharge,
      collectionDate: collectedBeforeAdmit, performedDate: performedAfterDischarge,
    });
    expect(result).toBeUndefined();
  });

  it('never fires when required real dates are missing', async () => {
    const { checkMolecularPathologyDosException } = await import('./resolveBillingDateOfService');
    expect(checkMolecularPathologyDosException({ dosExceptionEligible: true, encounterClass: 'Outpatient' })).toBeUndefined();
  });

  it('the advisory note is honest about the three criteria this app cannot confirm', async () => {
    const { checkMolecularPathologyDosException } = await import('./resolveBillingDateOfService');
    const result = checkMolecularPathologyDosException({
      dosExceptionEligible: true, encounterClass: 'Outpatient',
      admitTime: admit, dischargeTime: discharge,
      collectionDate: collectedDuringStay, performedDate: performedAfterDischarge,
    });
    expect(result?.note).toContain('medical');
    expect(result?.note).toContain('blood bank');
  });
});

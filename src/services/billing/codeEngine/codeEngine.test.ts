// src/services/billing/codeEngine/codeEngine.test.ts — PS-89 (Batch 333), the pure rules.
import { describe, it, expect } from 'vitest';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import { applyNaturalSunset, momentBefore } from './naturalSunset';
import { ruleMatchesCountry } from './countryMatch';
import { autoMapColumns, missingRequiredMappings } from './csvColumnMapping';
import { normalizeImportDate, planCodeImport, synthesizeImportChangeReason, type CodeImportRequest } from './planCodeImport';
import { planApproveImportJob, planRejectImportJob, planRollbackImportJob, ruleReferenceKey } from './planImportJob';
import { resolveBillingRuleAt } from '../resolveBillingRuleAt';

const rule = (over: Partial<BillingRuleVersion>): BillingRuleVersion => ({
  billingCode: '88305', version: 1, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE',
  level: 'specimen', billingType: 'Global', cpt: '88305', createdAt: '2026-01-01', createdBy: 'seed', ...over,
});

describe('natural sunset', () => {
  it('keeps the prior version ACTIVE and closes it the moment before the new one starts', () => {
    const v1 = rule({});
    const v2 = rule({ version: 2, effectiveFrom: '2027-01-01' });
    const { versions, sunset } = applyNaturalSunset([v1, v2], v2);
    expect(versions[0]).toMatchObject({ status: 'ACTIVE', effectiveTo: '2026-12-31T23:59:59.999Z' });
    expect(sunset).toEqual({ billingCode: '88305', siteId: undefined, version: 1, previousEffectiveTo: null, closedTo: momentBefore('2027-01-01') });
    // dates before the change still resolve to v1, dates after to v2
    expect(resolveBillingRuleAt('88305', '2026-12-31', versions)?.version).toBe(1);
    expect(resolveBillingRuleAt('88305', '2027-01-01', versions)?.version).toBe(2);
  });

  it('never overwrites a deliberate expiry, touches other scopes, or erases a prior that starts later', () => {
    const expiring = rule({ effectiveTo: '2026-06-30' });
    const v2 = rule({ version: 2, effectiveFrom: '2027-01-01' });
    expect(applyNaturalSunset([expiring, v2], v2).sunset).toBeNull();
    const siteRule = rule({ siteId: 'site-1' });
    expect(applyNaturalSunset([siteRule, v2], v2).sunset).toBeNull();
    const later = rule({ effectiveFrom: '2028-01-01' });
    expect(applyNaturalSunset([later, v2], v2).sunset).toBeNull();
  });
});

describe('country and vocabulary filtering', () => {
  it('matches countries with UK/GB aliasing and EU membership', () => {
    expect(ruleMatchesCountry(undefined, 'US')).toBe(true);
    expect(ruleMatchesCountry('US', undefined)).toBe(true);
    expect(ruleMatchesCountry('GB', 'UK')).toBe(true);
    expect(ruleMatchesCountry('DE', 'EU')).toBe(true);
    expect(ruleMatchesCountry('EU', 'FR')).toBe(true);
    expect(ruleMatchesCountry('US', 'UK')).toBe(false);
    expect(ruleMatchesCountry('US', 'EU')).toBe(false);
  });

  it('extends the resolver without changing its behaviour when no options are given', () => {
    const us = rule({ country: 'US', vocabulary: 'CPT' });
    const opcs = rule({ billingCode: 'Q01', cpt: 'Q01.1', country: 'UK', vocabulary: 'NHS_OPCS4' });
    const legacy = rule({ billingCode: '88307', cpt: '88307', country: 'US' }); // no vocabulary → CPT
    const all = [us, opcs, legacy];
    expect(resolveBillingRuleAt('88305', '2026-06-01', all)?.version).toBe(1);
    expect(resolveBillingRuleAt('88305', '2026-06-01', all, undefined, { country: 'UK' })).toBeNull();
    expect(resolveBillingRuleAt('Q01', '2026-06-01', all, undefined, { country: 'GB', vocabulary: 'NHS_OPCS4' })?.cpt).toBe('Q01.1');
    expect(resolveBillingRuleAt('Q01', '2026-06-01', all, undefined, { vocabulary: 'CPT' })).toBeNull();
    expect(resolveBillingRuleAt('88307', '2026-06-01', all, undefined, { vocabulary: 'CPT' })?.cpt).toBe('88307');
  });
});

describe('CSV column mapping', () => {
  it('auto-maps common headers and lets one Code column feed billingCode and CPT', () => {
    expect(autoMapColumns(['Code', 'Short Descriptor', 'Work RVU', 'Effective Date'])).toEqual({
      cpt: 'Code', billingCode: 'Code', description: 'Short Descriptor', rvuWork: 'Work RVU', effectiveFrom: 'Effective Date',
    });
    expect(autoMapColumns(['Billing Code', 'CPT', 'HCPCS'])).toMatchObject({ billingCode: 'Billing Code', cpt: 'CPT' });
  });

  it('requires billingCode, CPT and an effective date (column or fallback)', () => {
    expect(missingRequiredMappings({})).toEqual(['billingCode', 'cpt', 'effectiveFrom']);
    expect(missingRequiredMappings({ billingCode: 'Code', cpt: 'Code' })).toEqual(['effectiveFrom']);
    expect(missingRequiredMappings({ billingCode: 'Code', cpt: 'Code' }, '2027-01-01')).toEqual([]);
  });
});

const baseReq: CodeImportRequest = {
  jobId: 'IMP-1', fileName: 'fees-2027.csv', uploadedBy: 'admin-a', uploaderLabel: 'a@lab.org', timestamp: '2026-10-01T00:00:00.000Z',
  vocabulary: 'CPT', country: 'US', mapping: { billingCode: 'Code', cpt: 'Code', effectiveFrom: 'Effective', description: 'Desc', rvuWork: 'RVU' },
};

describe('planCodeImport', () => {
  it('creates the next version per code, PENDING_APPROVAL under the job, with a synthesized reason', () => {
    const existing = [rule({})];
    const plan = planCodeImport(existing, [
      { Code: '88305', Effective: '2027-01-01', Desc: 'Code 88305 — Specimen Level', RVU: '1.2' },
      { Code: '88999', Effective: '1/15/2027', Desc: 'Code 88999 — Block Level', RVU: '' },
    ], baseReq);
    if (plan.ok === false) throw new Error('plan failed');
    expect(plan.problems).toEqual([]);
    expect(plan.newVersions.map(v => [v.billingCode, v.version, v.status, v.level, v.effectiveFrom])).toEqual([
      ['88305', 2, 'PENDING_APPROVAL', 'specimen', '2027-01-01'],
      ['88999', 1, 'PENDING_APPROVAL', 'block', '2027-01-15'],
    ]);
    expect(plan.newVersions[0]).toMatchObject({
      importJobId: 'IMP-1', vocabulary: 'CPT', country: 'US', rvuWork: 1.2, createdBy: 'admin-a', submittedForApprovalBy: 'admin-a',
      changeReason: 'Bulk Import [IMP-1] (fees-2027.csv) by a@lab.org',
    });
    expect(plan.job).toMatchObject({ status: 'PENDING_APPROVAL', codesProcessed: [{ billingCode: '88305', version: 2 }, { billingCode: '88999', version: 1 }] });
    expect(synthesizeImportChangeReason('J', 'f.csv', 'u', ' note ')).toBe('Bulk Import [J] (f.csv) by u: note');
  });

  it('refuses bad rows with a reason each, and uses the fallback date and default level', () => {
    const plan = planCodeImport([rule({ billingCode: 'PEND', status: 'PENDING_APPROVAL' })], [
      { Code: '', Effective: '2027-01-01' },
      { Code: 'A1', Effective: 'not a date' },
      { Code: 'A2', Effective: '2027-01-01', RVU: 'abc' },
      { Code: 'A3', Effective: '', Desc: 'Specimen Level' },
      { Code: 'A3', Effective: '', Desc: 'Specimen Level' },
      { Code: 'PEND', Effective: '2027-01-01', Desc: 'Specimen Level' },
      { Code: 'A4', Effective: '2027-01-01', Desc: 'no level words' },
    ], { ...baseReq, fallbackEffectiveFrom: '2027-02-01', defaultLevel: undefined });
    if (plan.ok === false) throw new Error('plan failed');
    expect(plan.problems.map(p => [p.row, p.code])).toEqual([
      [1, 'missingBillingCode'], [2, 'badEffectiveFrom'], [3, 'unknownLevel'], [5, 'duplicateInFile'], [6, 'pendingVersionExists'], [7, 'unknownLevel'],
    ]);
    expect(plan.newVersions.map(v => [v.billingCode, v.effectiveFrom])).toEqual([['A3', '2027-02-01']]);
    expect(normalizeImportDate('2027-13-45')).toBeNull();
  });

  it('refuses an incomplete mapping outright', () => {
    expect(planCodeImport([], [], { ...baseReq, mapping: { billingCode: 'Code' } })).toEqual({ ok: false, reason: 'mappingIncomplete', missing: ['cpt', 'effectiveFrom'] });
  });
});

describe('import job approve / reject / rollback', () => {
  const setup = () => {
    const plan = planCodeImport([rule({})], [
      { Code: '88305', Effective: '2027-01-01', Desc: 'Specimen Level' },
      { Code: '88999', Effective: '2027-01-01', Desc: 'Block Level' },
    ], baseReq);
    if (plan.ok === false) throw new Error('plan failed');
    return { versions: [rule({}), ...plan.newVersions], job: plan.job };
  };

  it('approves the whole job (four-eyes), activating rows and sunsetting what they replace', () => {
    const { versions, job } = setup();
    expect(planApproveImportJob(versions, job, 'admin-a', 'T')).toEqual({ ok: false, code: 'SAME_PERSON' });
    const res = planApproveImportJob(versions, job, 'admin-b', '2026-10-02T00:00:00.000Z');
    if (res.ok === false) throw new Error('approve failed');
    expect(res.versions.filter(v => v.importJobId).every(v => v.status === 'ACTIVE' && v.reviewedBy === 'admin-b')).toBe(true);
    expect(res.versions[0]).toMatchObject({ version: 1, status: 'ACTIVE', effectiveTo: '2026-12-31T23:59:59.999Z' });
    expect(res.job).toMatchObject({ status: 'APPROVED', sunsetTuples: [{ billingCode: '88305', version: 1, previousEffectiveTo: null }] });
    expect(planApproveImportJob(res.versions, res.job, 'admin-b', 'T')).toEqual({ ok: false, code: 'JOB_NOT_PENDING' });
  });

  it('rejects the whole job with a reason', () => {
    const { versions, job } = setup();
    expect(planRejectImportJob(versions, job, 'admin-b', ' ', 'T')).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    const res = planRejectImportJob(versions, job, 'admin-b', 'wrong year', 'T');
    if (res.ok === false) throw new Error('reject failed');
    expect(res.versions.filter(v => v.importJobId).map(v => v.status)).toEqual(['REJECTED', 'REJECTED']);
    expect(res.job.status).toBe('REJECTED');
  });

  it('rolls back: retires rows a charge used, removes the rest, reopens the prior version, keeps provenance', () => {
    const { versions, job } = setup();
    const approved = planApproveImportJob(versions, job, 'admin-b', 'T');
    if (approved.ok === false) throw new Error('approve failed');
    // A charge used 88305 v2 — and, in the same chunk, an unrelated 88999 v2 that doesn't exist.
    // Tuple-exact matching must not let "88999" + "v2" false-positive the job's 88999 v1.
    const refs = new Set([ruleReferenceKey('88305', undefined, 2), ruleReferenceKey('88999', undefined, 2)]);
    const res = planRollbackImportJob(approved.versions, approved.job, refs, 'admin-c', 'bad file', '2026-10-03T00:00:00.000Z');
    if (res.ok === false) throw new Error('rollback failed');
    const v2 = res.versions.find(v => v.billingCode === '88305' && v.version === 2)!;
    expect(v2.status).toBe('RETIRED');
    expect(v2.changeReason).toBe('Bulk Import [IMP-1] (fees-2027.csv) by a@lab.org');
    expect(v2.rollbackNotes?.[0]).toContain('bad file');
    expect(res.versions.some(v => v.billingCode === '88999')).toBe(false);
    expect(res.versions.find(v => v.billingCode === '88305' && v.version === 1)?.effectiveTo).toBeNull();
    expect(res.job).toMatchObject({
      status: 'PARTIALLY_RETIRED',
      rollbackMetadata: { purgedCount: 1, retiredCount: 1, purgedTuples: [{ billingCode: '88999', version: 1 }], reopenedTuples: [{ billingCode: '88305', version: 1 }] },
    });
    // after rollback, 2027 dates resolve to the reopened v1 again
    expect(resolveBillingRuleAt('88305', '2027-06-01', res.versions)?.version).toBe(1);
  });

  it('reports ROLLED_BACK when nothing was used, and refuses to roll back a pending job', () => {
    const { versions, job } = setup();
    expect(planRollbackImportJob(versions, job, new Set(), 'x', 'r', 'T')).toEqual({ ok: false, code: 'JOB_NOT_APPROVED' });
    const approved = planApproveImportJob(versions, job, 'admin-b', 'T');
    if (approved.ok === false) throw new Error('approve failed');
    const res = planRollbackImportJob(approved.versions, approved.job, new Set(), 'admin-c', 'undo', 'T2');
    if (res.ok === false) throw new Error('rollback failed');
    expect(res.job.status).toBe('ROLLED_BACK');
    expect(res.versions.filter(v => v.importJobId)).toEqual([]);
  });
});

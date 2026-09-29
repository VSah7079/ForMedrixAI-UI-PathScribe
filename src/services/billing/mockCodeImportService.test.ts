// src/services/billing/mockCodeImportService.test.ts — PS-89 (Batch 333), end to end.
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCodeImportService } from './mockCodeImportService';
import { mockBillingRuleService } from './mockBillingRuleService';
import { mockServiceChargeService } from './mockServiceChargeService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const request = {
  fileName: 'fees-2027.csv', uploadedBy: 'admin-a', vocabulary: 'CPT' as const, country: 'US',
  mapping: { billingCode: 'Code', cpt: 'CPT', effectiveFrom: 'Effective', description: 'Desc' },
};
const rows = [
  { Code: 'IHC-FIRST', CPT: '88342', Effective: '2027-01-01', Desc: 'Specimen Level' },
  { Code: 'NEW-2027', CPT: '88399', Effective: '2027-01-01', Desc: 'Block Level' },
];

describe('mockCodeImportService (PS-89)', () => {
  it('imports as one pending job that only a second person can decide, as a whole', async () => {
    const imported = await mockCodeImportService.importRows(rows, request);
    if (imported.ok === false) throw new Error(imported.error);
    const { job } = imported.data;
    expect(job.status).toBe('PENDING_APPROVAL');

    // Rows can't be decided one at a time.
    const single = await mockBillingRuleService.approveVersion('IHC-FIRST', 2, undefined, 'admin-b');
    expect(single).toMatchObject({ ok: false, error: expect.stringContaining('import job') });

    expect(await mockCodeImportService.approveJob(job.jobId, 'admin-a')).toMatchObject({ ok: false, error: expect.stringContaining('Four-Eyes') });
    expect(await mockCodeImportService.approveJob(job.jobId, 'admin-b')).toMatchObject({ ok: true, data: { status: 'APPROVED' } });

    // The existing rule still applies to 2026 dates; the import applies from 2027.
    const d2026 = await mockBillingRuleService.getActiveRuleAt('IHC-FIRST', '2026-11-01');
    const d2027 = await mockBillingRuleService.getActiveRuleAt('NEW-2027', '2027-02-01');
    if (!d2026.ok || !d2027.ok) throw new Error('lookup failed');
    expect(d2026.data?.version).toBe(1);
    expect(d2027.data?.cpt).toBe('88399');
  });

  it('refuses a file with bad rows unless asked to skip them', async () => {
    const bad = [...rows, { Code: 'X', CPT: 'X', Effective: 'soon', Desc: 'Specimen Level' }];
    expect(await mockCodeImportService.importRows(bad, request)).toMatchObject({ ok: false, code: 'ROWS_REFUSED', problems: [{ row: 3, code: 'badEffectiveFrom' }] });
    const skipped = await mockCodeImportService.importRows(bad, request, { skipRefusedRows: true });
    expect(skipped).toMatchObject({ ok: true, data: { problems: [{ row: 3 }] } });
    if (skipped.ok) expect(skipped.data.job.codesProcessed).toHaveLength(2);
  });

  it('rolls back an approved job: a charged version is retired, the rest removed', async () => {
    const imported = await mockCodeImportService.importRows(rows, request);
    if (imported.ok === false) throw new Error(imported.error);
    const jobId = imported.data.job.jobId;
    await mockCodeImportService.approveJob(jobId, 'admin-b');
    // A charge resolved against the imported IHC-FIRST v2.
    await mockServiceChargeService.saveCharge({
      id: 'chg-rollback-test', caseId: 'C1', specimenId: 'S1', billingCode: 'IHC-FIRST', cptCode: '88342', ruleVersion: 2,
      transactionType: 'charge', units: 1, status: 'DRAFT', createdAt: '2027-01-02T00:00:00.000Z', createdBy: 'u',
    } as any);

    const res = await mockCodeImportService.rollbackJob(jobId, 'admin-c', 'wrong fee schedule');
    expect(res).toMatchObject({ ok: true, data: { status: 'PARTIALLY_RETIRED', rollbackMetadata: { retiredCount: 1, purgedCount: 1 } } });
    const ihc = await mockBillingRuleService.getVersionsForBillingCode('IHC-FIRST');
    const added = await mockBillingRuleService.getVersionsForBillingCode('NEW-2027');
    if (!ihc.ok || !added.ok) throw new Error('lookup failed');
    expect(ihc.data.map(v => [v.version, v.status, v.effectiveTo])).toEqual([[1, 'ACTIVE', null], [2, 'RETIRED', expect.any(String)]]);
    expect(added.data).toEqual([]);
    const jobs = await mockCodeImportService.listJobs();
    expect(jobs.ok && jobs.data[0].jobId).toBe(jobId);
  });
});

describe('mockCodeImportService previews and audit (PS-89, Batch 334)', () => {
  it('previews without saving, and audits every decision in English', async () => {
    const { mockAuditService } = await import('../auditlog/mockAuditService');
    const bad = [...rows, { Code: 'X', CPT: 'X', Effective: 'soon', Desc: 'Specimen Level' }];
    const preview = await mockCodeImportService.previewImport(bad, request);
    expect(preview).toEqual({ ok: true, data: { importable: 2, problems: [{ row: 3, billingCode: 'X', code: 'badEffectiveFrom' }] } });
    expect(await mockCodeImportService.previewImport(rows, { ...request, mapping: { billingCode: 'Code' } }))
      .toMatchObject({ ok: false, code: 'MAPPING_INCOMPLETE', missing: ['cpt', 'effectiveFrom'] });
    expect(await mockCodeImportService.listJobs()).toEqual({ ok: true, data: [] });

    const imported = await mockCodeImportService.importRows(bad, { ...request, uploaderLabel: 'Admin A' }, { skipRefusedRows: true });
    if (imported.ok === false) throw new Error(imported.error);
    const jobId = imported.data.job.jobId;
    expect(await mockCodeImportService.rejectJob(jobId, 'admin-b', ' ')).toMatchObject({ ok: false, code: 'REASON_REQUIRED' });
    expect(await mockCodeImportService.approveJob(jobId, 'admin-a')).toMatchObject({ ok: false, code: 'SAME_PERSON' });
    await mockCodeImportService.rejectJob(jobId, 'admin-b', 'wrong year', { actorLabel: 'Admin B' });

    const logs = await mockAuditService.getAuditLogs({});
    const entries = (logs.ok ? logs.data : []).filter((l: any) => String(l.detail).includes(jobId));
    expect(entries.map((l: any) => [l.event, l.user])).toEqual(expect.arrayContaining([
      ['Billing code import uploaded', 'Admin A'],
      ['Billing code import rejected', 'Admin B'],
    ]));
    expect(entries.find((l: any) => l.event === 'Billing code import uploaded').detail).toContain('2 CPT codes submitted for approval (country US, enterprise-wide); 1 row skipped');
  });
});

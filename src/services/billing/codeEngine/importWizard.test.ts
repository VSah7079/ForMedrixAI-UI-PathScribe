// src/services/billing/codeEngine/importWizard.test.ts — PS-89 (Batch 334).
import { describe, it, expect } from 'vitest';
import { canSubmitImport, defaultCountryForVocabulary, readImportCsv, withMappedColumn, IMPORT_COUNTRY_GROUPS } from './importWizardRules';
import { canRollBackImportJob, isImportJobLockedFor, pendingImportJobs, perRowPendingVersions } from './pendingImportQueue';
import { importApprovedAudit, importRejectedAudit, importRolledBackAudit, importUploadedAudit } from './importJobAudit';
import type { CodeImportJob } from '@/types/billing/CodeImportJob';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';

const job = (over: Partial<CodeImportJob> = {}): CodeImportJob => ({
  jobId: 'IMP-1', fileName: 'fees.csv', uploadedBy: 'u1', timestamp: '2026-09-01T00:00:00.000Z', status: 'PENDING_APPROVAL',
  vocabulary: 'CPT', country: 'US', codesProcessed: [{ billingCode: 'A', version: 2 }, { billingCode: 'B', version: 1 }], ...over,
});

describe('importWizardRules', () => {
  it('reads headers and rows, keeping header text exactly as the rows are keyed', () => {
    const { headers, rows } = readImportCsv('Code, Effective\n88305,2027-01-01\n\n');
    expect(headers).toEqual(['Code', ' Effective']);
    expect(rows).toEqual([{ Code: '88305', ' Effective': '2027-01-01' }]);
  });

  it('defaults the country from the coding standard', () => {
    expect(['CPT', 'HCPCS', 'NHS_OPCS4', 'LOCAL_LAB'].map(v => defaultCountryForVocabulary(v as any))).toEqual(['US', 'US', 'UK', '']);
    expect(IMPORT_COUNTRY_GROUPS.eu).toHaveLength(27);
  });

  it('sets and clears a mapped column', () => {
    expect(withMappedColumn({ cpt: 'Code' }, 'billingCode', 'Code')).toEqual({ cpt: 'Code', billingCode: 'Code' });
    expect(withMappedColumn({ cpt: 'Code' }, 'cpt', '')).toEqual({});
  });

  it('only submits a checked file with importable rows, and refused rows only when skipped', () => {
    const problem = { row: 3, code: 'badRvu' as const };
    expect(canSubmitImport(null, true)).toBe(false);
    expect(canSubmitImport({ importable: 0, problems: [] }, true)).toBe(false);
    expect(canSubmitImport({ importable: 2, problems: [] }, false)).toBe(true);
    expect(canSubmitImport({ importable: 2, problems: [problem] }, false)).toBe(false);
    expect(canSubmitImport({ importable: 2, problems: [problem] }, true)).toBe(true);
  });
});

describe('pendingImportQueue', () => {
  it('leaves import-job versions out of the per-row queue and lists pending jobs once', () => {
    const v = (over: Partial<BillingRuleVersion>) => ({ billingCode: 'A', version: 1, status: 'PENDING_APPROVAL', ...over }) as BillingRuleVersion;
    expect(perRowPendingVersions([v({}), v({ version: 2, importJobId: 'IMP-1' }), v({ version: 3, status: 'ACTIVE' })]).map(x => x.version)).toEqual([1]);
    expect(pendingImportJobs([job(), job({ jobId: 'IMP-2', status: 'APPROVED' })]).map(j => j.jobId)).toEqual(['IMP-1']);
  });

  it('locks the uploader out and only rolls back approved jobs', () => {
    expect(isImportJobLockedFor(job(), 'u1')).toBe(true);
    expect(isImportJobLockedFor(job(), 'u2')).toBe(false);
    expect(canRollBackImportJob(job())).toBe(false);
    expect(canRollBackImportJob(job({ status: 'APPROVED' }))).toBe(true);
  });
});

describe('importJobAudit (literal English)', () => {
  it('describes each step of a job', () => {
    expect(importUploadedAudit(job({ batchNote: '2027 fees' }), 1)).toEqual({
      event: 'Billing code import uploaded',
      detail: 'Import IMP-1 (fees.csv): 2 CPT codes submitted for approval (country US, enterprise-wide); 1 row skipped; note: 2027 fees',
    });
    expect(importApprovedAudit(job({ status: 'APPROVED', sunsetTuples: [{ billingCode: 'A', version: 1, previousEffectiveTo: null, closedTo: 'x' }] })).detail)
      .toBe('Import IMP-1 (fees.csv) approved: 2 codes activated, 1 earlier version given an end date');
    expect(importRejectedAudit(job({ rejection: { reviewedBy: 'u2', reviewedAt: 'x', reason: 'wrong year' } })).detail)
      .toBe('Import IMP-1 (fees.csv) rejected: wrong year');
    expect(importRolledBackAudit(job({ rollbackMetadata: {
      rolledBackBy: 'u3', rolledBackAt: 'x', rollbackReason: 'bad file', purgedCount: 1, retiredCount: 1, purgedTuples: [], reopenedTuples: [{ billingCode: 'A', version: 1 }],
    } })).detail).toBe('Import IMP-1 (fees.csv) rolled back: bad file; 1 unused version removed, 1 version retired because charges used them, 1 earlier version reopened');
  });
});

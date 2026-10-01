// src/services/billing/mockCodeImportService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 (Batch 333): bulk code imports into the Billing Dictionary, as
// import jobs. Rules are the pure planners in codeEngine/; this service
// loads and saves (mock phase: localStorage, key
// `billing_code_import_jobs_v1`, alongside `billing_rule_versions_v1`).
//
//   importRows   → one PENDING_APPROVAL job + its PENDING_APPROVAL rows
//   approveJob   → four-eyes; activates every row, natural sunset
//   rejectJob    → four-eyes; rows REJECTED with the reason
//   rollbackJob  → used rows RETIRED, unused rows removed, priors reopened
//   previewImport (Batch 334) → the same plan, nothing saved
//
// Batch 334: every import / approve / reject / rollback writes an audit
// entry (codeEngine/importJobAudit.ts), and refusals carry a `code` the
// UI translates.
//
// The job ledger is append-only: jobs change status but are never deleted.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { CodeImportJob } from '@/types/billing/CodeImportJob';
import { loadBillingRuleVersions, persistBillingRuleVersions } from './mockBillingRuleService';
import { mockServiceChargeService } from './mockServiceChargeService';
import { planCodeImport, type CodeImportRequest, type ImportRowProblem } from './codeEngine/planCodeImport';
import { planApproveImportJob, planRejectImportJob, planRollbackImportJob, type ImportJobRefusal } from './codeEngine/planImportJob';
import { importApprovedAudit, importRejectedAudit, importRolledBackAudit, importUploadedAudit, type ImportJobAuditEntry } from './codeEngine/importJobAudit';
import { mockAuditService } from '../auditlog/mockAuditService';

export const CODE_IMPORT_JOBS_KEY = 'billing_code_import_jobs_v1';

const loadJobs = () => storageGet<CodeImportJob[]>(CODE_IMPORT_JOBS_KEY, []);
const saveJobs = (jobs: CodeImportJob[]) => storageSet(CODE_IMPORT_JOBS_KEY, jobs);
const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

/** Plain-English refusal messages; the UI shows its own translated text
 *  for each code. */
const REFUSAL: Record<ImportJobRefusal | 'NOT_FOUND' | 'NO_ROWS' | 'ROWS_REFUSED' | 'MAPPING_INCOMPLETE', string> = {
  NOT_FOUND:          'Import job not found.',
  JOB_NOT_PENDING:    'This import job is not pending approval.',
  JOB_NOT_APPROVED:   'Only an approved import job can be rolled back.',
  SAME_PERSON:        'Four-Eyes Principle: the person who uploaded this import cannot approve or reject it.',
  REASON_REQUIRED:    'A reason is required.',
  ROW_MISSING:        'A version created by this import job no longer exists.',
  ROW_NOT_PENDING:    'A version created by this import job is no longer pending approval.',
  NO_ROWS:            'The file has no importable rows.',
  ROWS_REFUSED:       'Some rows could not be imported. Fix them, or choose to skip them.',
  MAPPING_INCOMPLETE: 'Map the billing code, CPT code and effective date columns (or give a fallback date) first.',
};

export type CodeImportRefusal = keyof typeof REFUSAL;

export type CodeImportResult =
  | { ok: true; data: { job: CodeImportJob; problems: ImportRowProblem[] } }
  | { ok: false; error: string; code: CodeImportRefusal; problems?: ImportRowProblem[]; missing?: string[] };

export type CodeImportDecisionResult =
  | { ok: true; data: CodeImportJob }
  | { ok: false; error: string; code: CodeImportRefusal };

export interface CodeImportPreview {
  /** Rows that would become pending versions. */
  importable: number;
  problems: ImportRowProblem[];
}

export type CodeImportPreviewResult =
  | { ok: true; data: CodeImportPreview }
  | { ok: false; error: string; code: 'MAPPING_INCOMPLETE'; missing: string[] };

/** Who is acting, for the audit log; falls back to the user id. */
export interface CodeImportActorOptions { actorLabel?: string }

async function audit(entry: ImportJobAuditEntry, user: string): Promise<void> {
  await mockAuditService.logEvent({ type: 'user', event: entry.event, detail: entry.detail, user, caseId: null, confidence: null });
}

const newJobId = () => `IMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export const mockCodeImportService = {
  async listJobs(): Promise<ServiceResult<CodeImportJob[]>> {
    return ok([...loadJobs()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  },

  async getJob(jobId: string): Promise<ServiceResult<CodeImportJob>> {
    const job = loadJobs().find(j => j.jobId === jobId);
    return job ? ok(job) : err(REFUSAL.NOT_FOUND);
  },

  /** The import plan for these rows, without saving anything: how many
   *  rows would import and which would be refused, and why. */
  async previewImport(
    rows: Record<string, string>[],
    request: Omit<CodeImportRequest, 'jobId' | 'timestamp'>,
  ): Promise<CodeImportPreviewResult> {
    const plan = planCodeImport(loadBillingRuleVersions(), rows, { ...request, jobId: 'PREVIEW', timestamp: new Date().toISOString() });
    if (plan.ok === false) return { ok: false, error: REFUSAL.MAPPING_INCOMPLETE, code: 'MAPPING_INCOMPLETE', missing: plan.missing };
    return { ok: true, data: { importable: plan.newVersions.length, problems: plan.problems } };
  },

  /** Plans and saves an import. Refuses the whole file if any row has a
   *  problem, unless `skipRefusedRows` is set, in which case the good rows
   *  are imported and the problems are returned. */
  async importRows(
    rows: Record<string, string>[],
    request: Omit<CodeImportRequest, 'jobId' | 'timestamp'> & { jobId?: string; timestamp?: string },
    options: { skipRefusedRows?: boolean } = {},
  ): Promise<CodeImportResult> {
    const req: CodeImportRequest = { ...request, jobId: request.jobId ?? newJobId(), timestamp: request.timestamp ?? new Date().toISOString() };
    const versions = loadBillingRuleVersions();
    const plan = planCodeImport(versions, rows, req);
    if (plan.ok === false) return { ok: false, error: REFUSAL.MAPPING_INCOMPLETE, code: 'MAPPING_INCOMPLETE', missing: plan.missing };
    if (plan.problems.length && !options.skipRefusedRows) {
      return { ok: false, error: REFUSAL.ROWS_REFUSED, code: 'ROWS_REFUSED', problems: plan.problems };
    }
    if (!plan.newVersions.length) return { ok: false, error: REFUSAL.NO_ROWS, code: 'NO_ROWS', problems: plan.problems };
    persistBillingRuleVersions([...versions, ...plan.newVersions]);
    saveJobs([...loadJobs(), plan.job]);
    const skipped = new Set(plan.problems.map(p => p.row)).size;
    await audit(importUploadedAudit(plan.job, skipped), req.uploaderLabel ?? req.uploadedBy);
    return { ok: true, data: { job: plan.job, problems: plan.problems } };
  },

  async approveJob(jobId: string, reviewedBy: string, options: CodeImportActorOptions = {}): Promise<CodeImportDecisionResult> {
    return decide(jobId, (versions, job) => planApproveImportJob(versions, job, reviewedBy, new Date().toISOString()),
      importApprovedAudit, options.actorLabel ?? reviewedBy);
  },

  async rejectJob(jobId: string, reviewedBy: string, reason: string, options: CodeImportActorOptions = {}): Promise<CodeImportDecisionResult> {
    return decide(jobId, (versions, job) => planRejectImportJob(versions, job, reviewedBy, reason, new Date().toISOString()),
      importRejectedAudit, options.actorLabel ?? reviewedBy);
  },

  async rollbackJob(jobId: string, rolledBackBy: string, reason: string, options: CodeImportActorOptions = {}): Promise<CodeImportDecisionResult> {
    const refs = await mockServiceChargeService.listRuleReferenceKeys();
    const keys = new Set(refs.ok ? refs.data : []);
    return decide(jobId, (versions, job) => planRollbackImportJob(versions, job, keys, rolledBackBy, reason, new Date().toISOString()),
      importRolledBackAudit, options.actorLabel ?? rolledBackBy);
  },
};

async function decide(
  jobId: string,
  plan: (versions: ReturnType<typeof loadBillingRuleVersions>, job: CodeImportJob) => ReturnType<typeof planApproveImportJob>,
  auditEntry: (job: CodeImportJob) => ImportJobAuditEntry,
  actor: string,
): Promise<CodeImportDecisionResult> {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.jobId === jobId);
  if (idx === -1) return { ok: false, error: REFUSAL.NOT_FOUND, code: 'NOT_FOUND' };
  const result = plan(loadBillingRuleVersions(), jobs[idx]);
  if (result.ok === false) return { ok: false, error: REFUSAL[result.code], code: result.code };
  persistBillingRuleVersions(result.versions);
  const nextJobs = [...jobs];
  nextJobs[idx] = result.job;
  saveJobs(nextJobs);
  await audit(auditEntry(result.job), actor);
  return { ok: true, data: result.job };
}

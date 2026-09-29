// src/services/billing/codeEngine/importJobAudit.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 (Batch 334): audit-log entries for code import jobs. Literal
// English, because audit records are compliance artifacts, not UI
// (services/auditlog/README.md). Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { CodeImportJob } from '@/types/billing/CodeImportJob';

export interface ImportJobAuditEntry { event: string; detail: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const jobLabel = (job: CodeImportJob) => `Import ${job.jobId} (${job.fileName})`;

const scope = (job: CodeImportJob) =>
  [job.country ? `country ${job.country}` : null, job.siteId ? `site ${job.siteId}` : 'enterprise-wide'].filter(Boolean).join(', ');

export function importUploadedAudit(job: CodeImportJob, skippedRows: number): ImportJobAuditEntry {
  const parts = [
    `${jobLabel(job)}: ${plural(job.codesProcessed.length, `${job.vocabulary} code`)} submitted for approval (${scope(job)})`,
  ];
  if (skippedRows) parts.push(`${plural(skippedRows, 'row')} skipped`);
  if (job.batchNote) parts.push(`note: ${job.batchNote}`);
  return { event: 'Billing code import uploaded', detail: parts.join('; ') };
}

export function importApprovedAudit(job: CodeImportJob): ImportJobAuditEntry {
  const closed = job.sunsetTuples?.length ?? 0;
  return {
    event: 'Billing code import approved',
    detail: `${jobLabel(job)} approved: ${plural(job.codesProcessed.length, 'code')} activated, ${plural(closed, 'earlier version')} given an end date`,
  };
}

export function importRejectedAudit(job: CodeImportJob): ImportJobAuditEntry {
  return {
    event: 'Billing code import rejected',
    detail: `${jobLabel(job)} rejected: ${job.rejection?.reason ?? ''}`,
  };
}

export function importRolledBackAudit(job: CodeImportJob): ImportJobAuditEntry {
  const m = job.rollbackMetadata;
  return {
    event: 'Billing code import rolled back',
    detail: `${jobLabel(job)} rolled back: ${m?.rollbackReason ?? ''}; ${plural(m?.purgedCount ?? 0, 'unused version')} removed, `
      + `${plural(m?.retiredCount ?? 0, 'version')} retired because charges used them, ${plural(m?.reopenedTuples.length ?? 0, 'earlier version')} reopened`,
  };
}

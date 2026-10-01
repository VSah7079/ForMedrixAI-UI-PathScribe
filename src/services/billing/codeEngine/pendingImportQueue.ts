// src/services/billing/codeEngine/pendingImportQueue.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 (Batch 334): what System → Pending Approvals shows for bulk code
// imports. Pure.
//
//   • Versions created by an import job are approved or rejected with the
//     job, never one at a time (mockBillingRuleService refuses that), so
//     they leave the per-row billing-rule list and the job appears once in
//     the whole-import list instead.
//   • Four-eyes: the person who uploaded a job can't decide it (the same
//     rule planImportJob.ts enforces; shown here so the buttons are locked
//     before anyone tries).
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import type { CodeImportJob } from '@/types/billing/CodeImportJob';

/** Pending rule versions reviewed one at a time: not part of an import job. */
export function perRowPendingVersions(versions: readonly BillingRuleVersion[]): BillingRuleVersion[] {
  return versions.filter(v => v.status === 'PENDING_APPROVAL' && !v.importJobId);
}

/** Import jobs waiting for a second person. */
export function pendingImportJobs(jobs: readonly CodeImportJob[]): CodeImportJob[] {
  return jobs.filter(j => j.status === 'PENDING_APPROVAL');
}

export function isImportJobLockedFor(job: CodeImportJob, userId: string): boolean {
  return job.uploadedBy === userId;
}

/** Only an approved job can be rolled back (planRollbackImportJob). */
export function canRollBackImportJob(job: CodeImportJob): boolean {
  return job.status === 'APPROVED';
}

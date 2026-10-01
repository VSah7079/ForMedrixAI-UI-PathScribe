// src/services/billing/codeEngine/planImportJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 (Batch 333): deciding an import job as a whole — approve, reject,
// or roll back — per Pete's "one batch, one approval".
//
//   Approve  (four-eyes: the reviewer can't be the uploader)
//     every row PENDING_APPROVAL → ACTIVE, and each superseded version is
//     closed by natural sunset (recorded on the job, so a rollback can
//     reopen it).
//   Reject   every row → REJECTED with the reason; nothing goes live.
//   Rollback (APPROVED jobs only) — PS-89 §3-§4:
//     • a row a service charge already resolved against becomes RETIRED
//       (the charge's audit trail needs it); rollback commentary is
//       appended to rollbackNotes, never replacing changeReason;
//     • a row never used is removed, and survives only in the job's
//       purgedTuples;
//     • versions the job's approval closed are reopened, if nothing has
//       changed their end date since.
//   References are matched on the exact (billingCode, siteId, version)
//   tuple, never a cross-join of codes and versions (the bug §4 caught).
//
// Pure: the caller supplies the rows, the job and the charge references.
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import type { CodeImportJob, CodeImportTuple } from '@/types/billing/CodeImportJob';
import { applyNaturalSunset } from './naturalSunset';

export type ImportJobRefusal = 'JOB_NOT_PENDING' | 'JOB_NOT_APPROVED' | 'SAME_PERSON' | 'REASON_REQUIRED' | 'ROW_MISSING' | 'ROW_NOT_PENDING';

export type ImportJobPlan =
  | { ok: true; versions: BillingRuleVersion[]; job: CodeImportJob }
  | { ok: false; code: ImportJobRefusal; tuple?: CodeImportTuple };

/** The exact identity of a rule version, as a ServiceChargeRecord refers
 *  to it (billingCode, the resolved rule's siteId, ruleVersion). */
export const ruleReferenceKey = (billingCode: string, siteId: string | undefined, version: number) =>
  `${billingCode}::${siteId ?? ''}::${version}`;

const findRow = (versions: BillingRuleVersion[], t: CodeImportTuple) =>
  versions.findIndex(v => v.billingCode === t.billingCode && (v.siteId ?? undefined) === (t.siteId ?? undefined) && v.version === t.version);

export function planApproveImportJob(
  versions: BillingRuleVersion[], job: CodeImportJob, reviewedBy: string, at: string,
): ImportJobPlan {
  if (job.status !== 'PENDING_APPROVAL') return { ok: false, code: 'JOB_NOT_PENDING' };
  if (reviewedBy === job.uploadedBy) return { ok: false, code: 'SAME_PERSON' };

  let next = [...versions];
  const sunsetTuples: NonNullable<CodeImportJob['sunsetTuples']> = [];
  for (const t of job.codesProcessed) {
    const idx = findRow(next, t);
    if (idx === -1) return { ok: false, code: 'ROW_MISSING', tuple: t };
    if (next[idx].status !== 'PENDING_APPROVAL') return { ok: false, code: 'ROW_NOT_PENDING', tuple: t };
    const activated: BillingRuleVersion = { ...next[idx], status: 'ACTIVE', reviewedBy, reviewedAt: at };
    next[idx] = activated;
    const sunset = applyNaturalSunset(next, activated);
    next = sunset.versions;
    if (sunset.sunset) {
      const { billingCode, siteId, version, previousEffectiveTo, closedTo } = sunset.sunset;
      sunsetTuples.push({ billingCode, ...(siteId ? { siteId } : {}), version, previousEffectiveTo, closedTo });
    }
  }
  return {
    ok: true,
    versions: next,
    job: { ...job, status: 'APPROVED', approval: { reviewedBy, reviewedAt: at }, sunsetTuples },
  };
}

export function planRejectImportJob(
  versions: BillingRuleVersion[], job: CodeImportJob, reviewedBy: string, reason: string, at: string,
): ImportJobPlan {
  if (job.status !== 'PENDING_APPROVAL') return { ok: false, code: 'JOB_NOT_PENDING' };
  if (reviewedBy === job.uploadedBy) return { ok: false, code: 'SAME_PERSON' };
  if (!reason.trim()) return { ok: false, code: 'REASON_REQUIRED' };
  const next = [...versions];
  for (const t of job.codesProcessed) {
    const idx = findRow(next, t);
    if (idx !== -1 && next[idx].status === 'PENDING_APPROVAL') {
      next[idx] = { ...next[idx], status: 'REJECTED', reviewedBy, reviewedAt: at, rejectionReason: reason.trim() };
    }
  }
  return { ok: true, versions: next, job: { ...job, status: 'REJECTED', rejection: { reviewedBy, reviewedAt: at, reason: reason.trim() } } };
}

export function planRollbackImportJob(
  versions: BillingRuleVersion[],
  job: CodeImportJob,
  /** ruleReferenceKey()s of every version a service charge resolved against. */
  referencedKeys: ReadonlySet<string>,
  rolledBackBy: string,
  reason: string,
  at: string,
): ImportJobPlan {
  if (job.status !== 'APPROVED') return { ok: false, code: 'JOB_NOT_APPROVED' };
  if (!reason.trim()) return { ok: false, code: 'REASON_REQUIRED' };

  const note = `Rolled back with import ${job.jobId} by ${rolledBackBy} on ${at}: ${reason.trim()}`;
  const purgedTuples: Array<CodeImportTuple & { deletedAt: string }> = [];
  let retiredCount = 0;
  const purge = new Set<string>();
  let next = versions.map(v => {
    const isJobRow = job.codesProcessed.some(t => t.billingCode === v.billingCode && (t.siteId ?? undefined) === (v.siteId ?? undefined) && t.version === v.version);
    if (!isJobRow) return v;
    if (referencedKeys.has(ruleReferenceKey(v.billingCode, v.siteId, v.version))) {
      retiredCount += 1;
      return { ...v, status: 'RETIRED' as const, effectiveTo: v.effectiveTo ?? at, rollbackNotes: [...(v.rollbackNotes ?? []), note] };
    }
    purge.add(ruleReferenceKey(v.billingCode, v.siteId, v.version));
    purgedTuples.push({ billingCode: v.billingCode, ...(v.siteId ? { siteId: v.siteId } : {}), version: v.version, deletedAt: at });
    return v;
  });
  next = next.filter(v => !purge.has(ruleReferenceKey(v.billingCode, v.siteId, v.version)));

  const reopenedTuples: CodeImportTuple[] = [];
  for (const s of job.sunsetTuples ?? []) {
    const idx = findRow(next, s);
    if (idx !== -1 && next[idx].effectiveTo === s.closedTo) {
      next[idx] = { ...next[idx], effectiveTo: s.previousEffectiveTo };
      reopenedTuples.push({ billingCode: s.billingCode, ...(s.siteId ? { siteId: s.siteId } : {}), version: s.version });
    }
  }

  return {
    ok: true,
    versions: next,
    job: {
      ...job,
      status: retiredCount > 0 ? 'PARTIALLY_RETIRED' : 'ROLLED_BACK',
      rollbackMetadata: {
        rolledBackBy, rolledBackAt: at, rollbackReason: reason.trim(),
        purgedCount: purgedTuples.length, retiredCount, purgedTuples, reopenedTuples,
      },
    },
  };
}

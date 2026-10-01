// src/services/billing/isCaseSignedOutForBilling.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct correction: no business logic in UI code. This was
// previously a duplicated inline array
// (['finalized', 'pending-release', 'closed']) in both
// QualityAssurancePage.tsx and SynopticReportPage.tsx - the same real
// decision made twice, with no single place to fix or extend it. A
// pure, shared, testable function instead.
//
// Real, per direct guidance's own post-sign-out billing change design:
// these three CaseStatus values (types/case/CaseStatus.ts) all
// represent "the pathologist has already completed sign-out" -
// 'pending-release' included, since that's the real recall-buffer
// window after sign-out is genuinely done, not before it.
// ─────────────────────────────────────────────────────────────────────────────

import type { CaseStatus } from '@/types/case/CaseStatus';

const SIGNED_OUT_STATUSES: readonly CaseStatus[] = ['finalized', 'pending-release', 'closed'];

/** Real, per direct guidance - true when a case's own status means
 *  sign-out has already genuinely happened, so any further billing
 *  change is a real post-sign-out change requiring the documented
 *  reason + comment gate. Undefined/null status is honestly false,
 *  never assumed signed-out. */
export function isCaseSignedOutForBilling(status: CaseStatus | undefined | null): boolean {
  if (!status) return false;
  return SIGNED_OUT_STATUSES.includes(status);
}

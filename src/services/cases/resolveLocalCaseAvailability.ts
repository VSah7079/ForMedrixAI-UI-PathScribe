// src/services/cases/resolveLocalCaseAvailability.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Step 2 ("Pathscribe checks its
// local database for the accession... If Case Found: Open
// immediately... If Case Missing: Proceed to [remote fetch]").
//
// Real, deliberate tie-in to the amendment-notice discussion this
// design followed directly from: a case with a pending
// LisAmendmentNotice is treated as a real, deliberate cache miss —
// evicted rather than opened from what could be stale local data —
// so it falls into this exact same on-demand fetch path Step 2
// already defines, rather than needing a second, separate "refresh"
// mechanism. One real workflow, not two.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';

export type LocalCaseAvailability =
  | { availability: 'available_locally'; caseData: Case }
  | { availability: 'needs_remote_fetch'; reason: 'not_in_local_cache' | 'pending_lis_amendment' };

/**
 * Pure. `pendingAmendmentCaseIds` — the same real, existing set
 * WorklistPage.tsx already builds from lisAmendmentNoticeService's
 * own real getPendingForPathologist() — passed in, never re-derived
 * here, so this stays a pure function with no service dependency of
 * its own.
 */
export function resolveLocalCaseAvailability(
  accessionNumber: string,
  localCases: Case[],
  pendingAmendmentCaseIds: Set<string>,
): LocalCaseAvailability {
  const localMatch = localCases.find(c => c.accession?.fullAccession === accessionNumber);
  if (!localMatch) return { availability: 'needs_remote_fetch', reason: 'not_in_local_cache' };
  if (pendingAmendmentCaseIds.has(localMatch.id)) {
    return { availability: 'needs_remote_fetch', reason: 'pending_lis_amendment' };
  }
  return { availability: 'available_locally', caseData: localMatch };
}

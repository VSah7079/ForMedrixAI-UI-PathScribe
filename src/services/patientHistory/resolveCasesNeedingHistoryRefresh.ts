// src/services/patientHistory/resolveCasesNeedingHistoryRefresh.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own "we could schedule the process
// nightly." Pure, testable — the actual real decision logic behind
// that schedule: which active, Assist-mode cases genuinely need a
// (re)fetch right now. The real cron/scheduler infrastructure itself
// is a genuine backend need this app has no scheduler to run (see
// this folder's own README) — this function is the one real,
// frontend-testable piece: given the current state, what SHOULD
// happen, leaving WHEN it actually runs to real backend
// infrastructure.
// ─────────────────────────────────────────────────────────────────────────────

import type { PatientHistoryCacheEntry } from '@/types/patientHistory/PatientHistoryCacheEntry';

/** Real, deliberate cap — a genuinely unreachable LIS should not be
 *  retried forever, every single night, indefinitely. Matches this
 *  app's own established "never loop back / never retry forever on a
 *  real, confirmed failure" posture elsewhere (advanceDemoSpecimen,
 *  the OR dismissal gate). */
export const MAX_HISTORY_FETCH_ATTEMPTS = 3;

export interface CaseNeedingHistoryRefresh {
  caseId: string;
  patientId: string;
}

/**
 * Real, per direct guidance's own full lifecycle — only genuinely
 * ACTIVE (not yet signed out), Assist-mode cases are considered at
 * all; a signed-out case's own cache should already have been
 * destroyed at sign-out, never picked back up by this sweep. Within
 * that set: a case with no cache entry yet, or one that's failed
 * fewer than MAX_HISTORY_FETCH_ATTEMPTS times, needs a real
 * (re)fetch. A case already 'fetched', or one that has exhausted its
 * real retry budget, does not.
 */
export function resolveCasesNeedingHistoryRefresh(
  activeAssistModeCases: { caseId: string; patientId: string }[],
  existingCacheEntries: PatientHistoryCacheEntry[],
): CaseNeedingHistoryRefresh[] {
  const cacheByCase = new Map(existingCacheEntries.map(e => [e.caseId, e]));

  return activeAssistModeCases
    .filter(c => {
      const entry = cacheByCase.get(c.caseId);
      if (!entry) return true; // never attempted yet
      if (entry.status === 'fetched') return false;
      return entry.failedAttemptCount < MAX_HISTORY_FETCH_ATTEMPTS;
    })
    .map(c => ({ caseId: c.caseId, patientId: c.patientId }));
}

// src/types/patientHistory/PatientHistoryCacheEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: rather than a bulk historical-data
// migration for Assist-mode deployments (where the LIS remains the
// system of record — see ReportingMode's own doc comment), fetch a
// patient's prior reports live from that same real LIS connection
// this app already establishes for Assist mode (FHIRCaseService.ts),
// cache them only for the real duration the case is active, and
// destroy the cache at sign-out. Real, deliberate data-minimization
// choice, not just a performance one: PathScribe never becomes a
// second, permanent copy of a patient's full history in Assist mode
// — that record stays owned by the real LIS, exactly matching
// ReportingMode's own "LIS owns the report" contract.
//
// Real, honest split from the Orchestrator-mode migration story
// (services/migration/) per direct guidance's own "let's do both":
// this is the live, per-case, temporary-cache path for Assist mode,
// where a live LIS connection already exists; migration/ is the
// bulk, one-time, permanent-import path for Orchestrator mode, where
// a customer is retiring their old LIS entirely and no live
// connection will exist afterward.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per-report summary — deliberately NOT the full original
 *  report content/binary. A pathologist reviewing history needs the
 *  real clinical substance (what was found, when, where) to inform
 *  the active case, not a verbatim archival copy — that copy stays
 *  in the real LIS, which remains the system of record in Assist
 *  mode by design. */
export interface PatientHistoryReport {
  sourceAccessionNumber: string;
  reportDate: string; // ISO date
  specimenDescription: string;
  diagnosisSummary: string;
  sourceSystemName: string;
}

export type PatientHistoryFetchStatus = 'pending' | 'fetched' | 'failed';

export interface PatientHistoryCacheEntry {
  id: string;
  caseId: string;
  patientId: string;
  status: PatientHistoryFetchStatus;
  reports: PatientHistoryReport[];
  /** Real, when status is 'fetched' or 'failed' — undefined while
   *  genuinely still 'pending' (never fetched yet, or a retry hasn't
   *  run). Real, honest per-fetch-attempt error message when status
   *  is 'failed' — never a generic string, so a real admin reviewing
   *  a failed fetch knows why (real LIS lookup patterns, e.g. "LIS
   *  unreachable" vs "no MRN match found", need genuinely different
   *  follow-up). */
  fetchedAt?: string;
  errorMessage?: string;
  /** Real count of consecutive failed attempts — the nightly sweep's
   *  own real retry-with-backoff signal (resolveCasesNeedingHistoryRefresh.ts),
   *  never retried forever on a genuinely unreachable LIS. */
  failedAttemptCount: number;
}

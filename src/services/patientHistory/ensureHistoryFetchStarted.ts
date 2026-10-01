// src/services/patientHistory/ensureHistoryFetchStarted.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "we have a mechanism to pull cases and
// get them assigned to the Pathologist worklist or to a pool
// worklist. When that event occurs is the first time PathScribe [is]
// aware of the case." Confirmed directly first: that mechanism is
// services/cases/casePoolAssignmentService.ts's own routeCase() —
// called from the real HL7 inbound handler and the real LIS polling
// service per that file's own header comment, whether a case ends up
// directly assigned from the LIS or pool-routed. This is the single,
// real orchestration point wired into routeCase()'s own entry, tying
// the two separate services (cache lifecycle, live LIS fetch)
// together — deliberately kept out of both of those services
// themselves, so neither needs to know about the other.
//
// Real, deliberately idempotent (ensurePending's own real no-op on a
// second call for the same case) — safe to call from more than one
// real entry point without any risk of double-fetching or
// duplicate work, since the exact, single real point where every
// new case first becomes known was not fully traced across this
// app's whole HL7-ingestion layer within the time available; calling
// this from every plausible real entry point is safe, silently
// skipping ones that turn out redundant, rather than risking a case
// that's never covered at all.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import { mockPatientHistoryCacheService } from './mockPatientHistoryCacheService';
import { mockPatientHistoryLisService } from './mockPatientHistoryLisService';

export async function ensureHistoryFetchStarted(caseData: Case): Promise<void> {
  // Real, per ReportingMode's own contract — Orchestrator-mode cases
  // are covered by the real, separate bulk migration story
  // (services/migration/), never this live per-case fetch.
  if (caseData.reportingMode !== 'assist') return;
  const mrn = caseData.patient?.mrn;
  if (!mrn) return; // no real identifier to query the LIS with yet

  const pendingResult = await mockPatientHistoryCacheService.ensurePending(caseData.id, caseData.patient!.id);
  if (!pendingResult.ok || pendingResult.data.status !== 'pending') return; // already fetched or already in flight

  await performHistoryFetch(caseData.id, mrn);
}

/** Real, per the nightly sweep's own job (resolveCasesNeedingHistoryRefresh.ts)
 *  — deliberately does NOT go through ensurePending/the 'pending'-only
 *  gate above: the sweep has already decided this specific case
 *  genuinely needs a retry (a real prior failure, under the real
 *  retry budget), so this forces the actual attempt rather than
 *  silently no-op'ing because the case is sitting in 'failed', not
 *  'pending'. */
export async function retryHistoryFetch(caseId: string, mrn: string): Promise<void> {
  await performHistoryFetch(caseId, mrn);
}

async function performHistoryFetch(caseId: string, mrn: string): Promise<void> {
  const historyResult = await mockPatientHistoryLisService.fetchPatientHistory(mrn);
  if ('error' in historyResult) {
    await mockPatientHistoryCacheService.markFailed(caseId, historyResult.error);
  } else {
    await mockPatientHistoryCacheService.markFetched(caseId, historyResult.data);
  }
}

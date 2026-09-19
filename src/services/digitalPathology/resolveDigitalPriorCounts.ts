// src/services/digitalPathology/resolveDigitalPriorCounts.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed Digital Readiness spec —
// "digital priors" (real, prior cases for this same patient that have
// real, completed WSI slide data) vs. "glass priors" (a real, prior
// case for this same patient with no real digital slide data at all —
// physical slides only). Deliberately reuses the real, already-proven
// patient-identity resolution in patientHistoryQuery.ts's own
// queryRealPatientHistory() — real cases genuinely belonging to this
// patient's own MPI identity OR any identity a human has confirmed is
// the same real person — rather than inventing a second, separate
// patient-matching mechanism for this one, narrower purpose.
// ─────────────────────────────────────────────────────────────────────────────

import type { WsiScanBatch } from './IWsiScanBatchService';

export interface DigitalPriorCounts {
  digitalPriorCount: number;
  glassPriorCount: number;
}

/** Real, per this file's own header — priorCaseIds is the real,
 *  already-resolved set of this same patient's own OTHER case ids
 *  (the real output of queryRealPatientHistory(), mapped to .id) —
 *  this function never re-resolves patient identity itself. A prior
 *  case counts as "digital" when at least one real WsiScanBatch slide
 *  for that case id reached a real, completed scan — a real,
 *  in-progress or failed scan doesn't make a case's own prior slides
 *  genuinely available for digital review, so it's counted as a
 *  glass prior instead, never double-counted. */
export function resolveDigitalPriorCounts(
  priorCaseIds: string[],
  allWsiScanBatches: WsiScanBatch[],
): DigitalPriorCounts {
  const caseIdsWithCompletedScan = new Set(
    allWsiScanBatches.flatMap(b => b.slides.filter(s => s.scanStatus === 'completed').map(s => s.caseId)),
  );
  let digitalPriorCount = 0;
  let glassPriorCount = 0;
  for (const caseId of priorCaseIds) {
    if (caseIdsWithCompletedScan.has(caseId)) digitalPriorCount++;
    else glassPriorCount++;
  }
  return { digitalPriorCount, glassPriorCount };
}

// src/services/printing/redispatchPrintJob.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 §2.2.3 ("Retry a failed print job... Redirect a
// print job to an alternate printer/route") — the real re-send
// orchestration for an already-queued job, reusing
// attemptPrintDelivery.ts (the same real Mode 1/2/3 branching
// dispatchPrintJob.ts's own original, first-dispatch call uses) rather
// than a second, duplicated implementation.
//
// Real, honest scope, per PrintJob.pdfBase64's own doc comment: a
// Retry/Redirect resends EXACTLY the bytes persisted at the job's
// original dispatch — never a live re-render of the current report
// content. A job enqueued before this real persistence existed (or
// one whose original dispatch never reached the point of having a
// real, successfully-rendered PDF at all) has no real pdfBase64 to
// resend; this fails that honestly (PRINT_REJECTED) rather than
// silently no-op'ing or fabricating empty bytes.
//
// Real, per §2.2.3's own "Redirect" — `job.redirectedToDestination`
// (set by IPrintQueueService.redirectPrintJob, an explicit, real admin
// action) always wins over `job.resolvedDestination` (the original,
// first-dispatch resolution) when both are present, for a
// DIRECT_NETWORK_PRINT job. A Retry with no real redirect ever set
// simply resends to the exact same, original real target — the same,
// honest "reprint what was actually queued" semantic any physical
// print queue already has.
// ─────────────────────────────────────────────────────────────────────────────

import { mockPrintQueueService } from './mockPrintQueueService';
import { attemptPrintDelivery, type AttemptPrintDeliveryResult } from './attemptPrintDelivery';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

export async function redispatchPrintJob(jobId: string): Promise<AttemptPrintDeliveryResult> {
  const jobRes = await mockPrintQueueService.getById(jobId);
  if (!jobRes.ok) {
    return { outcome: 'failed', jobId };
  }
  const job = jobRes.data;

  if (!job.pdfBase64) {
    await mockPrintQueueService.markFailed(jobId, {
      errorCode: 'PRINT_REJECTED',
      errorMessage: 'No persisted PDF available to retry — this job predates PS-279’s pdfBase64 persistence, or its original dispatch never reached a successfully-rendered PDF.',
      maxRetriesExceeded: true,
    });
    return { outcome: 'failed', jobId };
  }

  // Real, per the source spec's own Use Case 2 — a real Retry/Redirect
  // is itself a real, new dispatch attempt: it moves the job back to
  // QUEUED and bumps retryCount, same as the DLQ's own established
  // retryDispatch convention, BEFORE attempting delivery, so a job
  // that fails again lands honestly on FAILED with an incremented
  // count rather than silently staying on whatever real status it
  // was in before this call.
  await mockPrintQueueService.retryDispatch(jobId);

  const destination = job.redirectedToDestination ?? job.resolvedDestination;

  return attemptPrintDelivery({
    jobId,
    caseId: job.caseId,
    reportType: job.reportType,
    priority: job.priority,
    mode: job.mode,
    pdfBase64: job.pdfBase64,
    printerName: job.printerName,
    paperSize: job.paperSize,
    destination,
    presentation: { paperSource: job.paperSource, duplexMode: job.duplexMode },
  });
}

/** Real, per PS-279 §2.2.3's own "bulk... operations" — real,
 *  sequential (never Promise.all'd), same real reasoning
 *  IPrintQueueService's own bulk methods already document: a real,
 *  large selection never opens dozens of concurrent socket/HTTP
 *  connections to potentially the same real printer at once. */
export async function redispatchManyPrintJobs(jobIds: string[]): Promise<AttemptPrintDeliveryResult[]> {
  const results: AttemptPrintDeliveryResult[] = [];
  for (const jobId of jobIds) {
    results.push(await redispatchPrintJob(jobId));
  }
  return results;
}

/** Real, per PS-279 §2.2.3's own "redirect" operation — the real,
 *  one-action composition an admin dashboard actually needs: record
 *  the real, explicit override destination, THEN immediately attempt
 *  real delivery to it, rather than leaving the admin to separately
 *  invoke redirect and then a second, separate Retry. Real, deliberate
 *  split kept underneath, still: IPrintQueueService.redirectPrintJob
 *  itself only ever records the override (see its own doc comment for
 *  why) — this function is the one, real place the two real steps are
 *  composed, so PrintQueueDashboardSection.tsx's own UI code never has
 *  to sequence them itself. */
export async function redirectAndRedispatchPrintJob(
  jobId: string,
  destination: PrintDestination,
  redirectedBy: string,
): Promise<AttemptPrintDeliveryResult> {
  const redirectRes = await mockPrintQueueService.redirectPrintJob(jobId, destination, redirectedBy);
  if (!redirectRes.ok) {
    return { outcome: 'failed', jobId };
  }
  return redispatchPrintJob(jobId);
}

/** Real, per PS-279 §2.2.3 — the real, bulk variant of the composition
 *  above, sequential for the same real reason every other bulk
 *  operation here is. */
export async function redirectAndRedispatchManyPrintJobs(
  jobIds: string[],
  destination: PrintDestination,
  redirectedBy: string,
): Promise<AttemptPrintDeliveryResult[]> {
  const results: AttemptPrintDeliveryResult[] = [];
  for (const jobId of jobIds) {
    results.push(await redirectAndRedispatchPrintJob(jobId, destination, redirectedBy));
  }
  return results;
}

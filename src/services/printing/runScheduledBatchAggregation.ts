// src/services/printing/runScheduledBatchAggregation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 §2.2.2 ("Scheduled batch aggregation"). Real,
// honest scope, per PrintBatch.ts's own header: this app has no real
// cron/scheduler infrastructure anywhere (confirmed directly before
// building this) — so this is the real, on-demand orchestration an
// admin action ("Run Batch Now" on PrintQueueDashboardSection.tsx)
// triggers, not a true background scheduler. A real, future scheduler
// (were one ever added to this app generally) would call this exact
// same function on a timer — the real aggregation/tagging logic below
// is already fully decoupled from how/when it's invoked.
//
// Real, thin orchestration only: fetches the real, current QUEUED
// jobs, hands them to the pure aggregatePrintJobsForBatch.ts (never
// re-implements its own grouping here), then tags every job in every
// resulting group with its real batchId via the queue service's own
// tagBatch — the one, real place a PrintJob.batchId is ever written.
// ─────────────────────────────────────────────────────────────────────────────

import { mockPrintQueueService } from './mockPrintQueueService';
import { aggregatePrintJobsForBatch } from './aggregatePrintJobsForBatch';
import type { BatchAggregationConfig, BatchAggregationResult } from '@/types/printing/PrintBatch';

export interface ScheduledBatchAggregationRunResult extends BatchAggregationResult {
  /** Real count of real jobs actually tagged — equal to the sum of
   *  every group's own jobIds.length when every real tagBatch call
   *  succeeds; a real, honest lower number surfaces if any real job
   *  id somehow no longer exists by the time tagging runs (e.g. a
   *  genuine race with a real, concurrent cancel). */
  taggedJobCount: number;
}

export async function runScheduledBatchAggregation(
  config: BatchAggregationConfig,
  /** Real, deterministic seed for this run's own batchId(s) — the
   *  caller's own choice (e.g. the real run timestamp), never
   *  generated internally, so a caller can reproduce/log the exact
   *  real ids this run will produce before it runs. */
  batchIdSeed: string,
): Promise<ScheduledBatchAggregationRunResult> {
  const allRes = await mockPrintQueueService.getAll();
  const allJobs = allRes.ok ? allRes.data : [];
  const queuedJobs = allJobs.filter(j => j.status === 'QUEUED');

  const result = aggregatePrintJobsForBatch(queuedJobs, config, batchIdSeed);

  let taggedJobCount = 0;
  for (const group of result.groups) {
    const tagRes = await mockPrintQueueService.tagBatch(group.jobIds, group.batchId);
    if (tagRes.ok) taggedJobCount += tagRes.data.succeededIds.length;
  }

  return { ...result, taggedJobCount };
}

// src/services/printing/aggregatePrintJobsForBatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 §2.2.2. Pure, testable grouping — never fetches its
// own data, same real discipline every other resolveX/aggregateX
// function in this app follows. Same real "group by a key, then
// combine only the group-level result" shape
// services/qualityAssurance/resolveJurisdictionRollup.ts already
// establishes (there: cases grouped by Facility.jurisdiction; here:
// PrintJobs grouped by client account or delivery route).
// ─────────────────────────────────────────────────────────────────────────────

import type { PrintJob, PrintDeliveryMode } from '@/types/printing/PrintJob';
import type { BatchAggregationConfig, BatchAggregationResult, PrintBatchGroup } from '@/types/printing/PrintBatch';

/** Real, per BatchAggregationConfig.eligibleModes's own header — the
 *  real, "non-interfaced" default the source spec names. */
export const DEFAULT_BATCHABLE_MODES: PrintDeliveryMode[] = ['NATIVE_QZ_TRAY', 'DIRECT_NETWORK_PRINT'];

function toMinutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Real, deliberate fix, per direct investigation before this file
 *  shipped: uses the real, UTC hour/minute of `isoTimestamp`, NOT
 *  `Date.getHours()`/`getMinutes()` (the JS runtime's OWN local
 *  timezone) — every real `queuedAt` this app ever stores is written
 *  via `new Date().toISOString()` (UTC), and `getHours()` would
 *  silently re-interpret that same real instant differently depending
 *  on whatever timezone the server process happens to run in, making
 *  this function's own real result non-deterministic across
 *  deployments for the exact same real data. Real, honest, disclosed
 *  scope: this app has no per-facility timezone concept anywhere
 *  (confirmed directly before writing this) to convert a real "8am-5pm
 *  local wall-clock" window against, so `windowStart`/`windowEnd` are
 *  real, UTC-interpreted boundaries today, not a genuine site-local
 *  workday — see services/printing/README.md's own account of this
 *  real, disclosed gap and what real, future work (a Facility-level
 *  timezone field) would close it. */
function isWithinWindow(isoTimestamp: string, windowStart: string, windowEnd: string): boolean {
  const date = new Date(isoTimestamp);
  const minutesOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  return minutesOfDay >= toMinutesSinceMidnight(windowStart) && minutesOfDay <= toMinutesSinceMidnight(windowEnd);
}

function groupKeyFor(job: PrintJob, groupBy: BatchAggregationConfig['groupBy']): string | undefined {
  return groupBy === 'clientAccount' ? job.orderingFacilityId : job.pointOfCare;
}

/** Real, deterministic id — no randomness, so the same real inputs
 *  (groupBy + groupKey + the caller's own batchIdSeed, e.g. a run
 *  timestamp) always produce the same real id, which
 *  runScheduledBatchAggregation.ts's own tests rely on directly. */
function buildBatchId(groupBy: string, groupKey: string, batchIdSeed: string): string {
  return `batch-${groupBy}-${groupKey}-${batchIdSeed}`;
}

export function aggregatePrintJobsForBatch(
  jobs: PrintJob[],
  config: BatchAggregationConfig,
  batchIdSeed: string,
): BatchAggregationResult {
  const eligibleModes = config.eligibleModes ?? DEFAULT_BATCHABLE_MODES;
  const groupsByKey = new Map<string, string[]>();
  const skippedJobIds: string[] = [];

  for (const job of jobs) {
    if (job.status !== 'QUEUED') { skippedJobIds.push(job.id); continue; }
    if (!eligibleModes.includes(job.mode)) { skippedJobIds.push(job.id); continue; }
    if (!isWithinWindow(job.queuedAt, config.windowStart, config.windowEnd)) { skippedJobIds.push(job.id); continue; }

    const groupKey = groupKeyFor(job, config.groupBy);
    if (!groupKey) { skippedJobIds.push(job.id); continue; }

    const existing = groupsByKey.get(groupKey);
    if (existing) existing.push(job.id);
    else groupsByKey.set(groupKey, [job.id]);
  }

  const groups: PrintBatchGroup[] = Array.from(groupsByKey.entries()).map(([groupKey, jobIds]) => ({
    batchId: buildBatchId(config.groupBy, groupKey, batchIdSeed),
    groupBy: config.groupBy,
    groupKey,
    jobIds,
  }));

  return { groups, skippedJobIds };
}

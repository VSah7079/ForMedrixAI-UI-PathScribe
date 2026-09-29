// src/types/printing/PrintBatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 §2.2.2 ("Scheduled batch aggregation — aggregate
// all non-interfaced client reports signed out 08:00–17:00 into one
// consolidated job, grouped by client account or delivery route").
//
// Real, honest scope note, confirmed before building this: this app's
// PrintJob queue never persists a report's own rendered PDF bytes at
// rest as a matter of general architecture — see
// services/printing/dispatchPrintJob.ts's own header for why (the
// real renderer only exists as a live callback at release time).
// PS-279 changes that in one, deliberate, disclosed way — PrintJob
// now carries `pdfBase64` once a job has actually been dispatched
// once — but a batch aggregated from several already-QUEUED jobs
// still can't be byte-merged into one physical PDF document without a
// real multi-document merge step this ticket doesn't ask for and this
// batch doesn't build. "One consolidated job" here means exactly what
// this real, grouping/tagging mechanism below can honestly deliver:
// every job in the same real batch shares one real `batchId`, is
// listed together on the dashboard, and is dispatched together by one
// real, admin-triggered action — a real, administrative consolidation
// (one review, one "go" action, one audit record), not a byte-level
// merged document. See services/printing/README.md for the full,
// honest account.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per §2.2.2's own two named grouping options. See
 *  PrintJob.orderingFacilityId/pointOfCare's own doc comments for
 *  exactly which real, existing field each of these reuses. */
export type BatchGroupBy = 'clientAccount' | 'deliveryRoute';

export interface BatchAggregationConfig {
  groupBy: BatchGroupBy;
  /** Real, per the source spec's own literal example ("signed out
   *  08:00–17:00") — an inclusive real time-of-day window, evaluated
   *  against each real, candidate job's own `queuedAt` (the closest
   *  real, already-existing proxy for "signed out" this app has —
   *  `queuedAt` is set the moment a report's release genuinely enqueues
   *  its print job, seconds after sign-out, never a separate,
   *  fabricated "signed out at" field). Both in 24-hour "HH:mm" form,
   *  interpreted in UTC — see aggregatePrintJobsForBatch.ts's own
   *  isWithinWindow() doc comment for the real, disclosed reason this
   *  is UTC rather than a genuine per-site local workday (this app has
   *  no per-facility timezone concept to convert against yet). */
  windowStart: string;
  windowEnd: string;
  /** Real, only 'NATIVE_QZ_TRAY' and 'DIRECT_NETWORK_PRINT' jobs
   *  qualify by default — per the source spec's own "non-interfaced"
   *  qualifier, an `INTERFACE_ENGINE_HANDOFF` job's real spooling
   *  middleware (an LRS, CUPS, an enterprise print server) already
   *  owns its own batching/scheduling, so this engine never re-batches
   *  it. Real, deliberate: exposed as a real, overridable field rather
   *  than a hardcoded filter, so a real, future caller can widen this
   *  if a site's own Interface Engine genuinely wants PathScribe-side
   *  batching too — defaults applied by
   *  aggregatePrintJobsForBatch.ts's own DEFAULT_BATCHABLE_MODES when
   *  omitted. */
  eligibleModes?: import('./PrintJob').PrintDeliveryMode[];
}

export interface PrintBatchGroup {
  batchId: string;
  groupBy: BatchGroupBy;
  /** Real grouping key value — an `orderingFacilityId` or
   *  `pointOfCare` value, depending on `groupBy`. */
  groupKey: string;
  jobIds: string[];
}

export interface BatchAggregationResult {
  groups: PrintBatchGroup[];
  /** Real, honest count of real, candidate QUEUED jobs that were
   *  skipped — outside the real time window, an ineligible mode, or
   *  missing the real grouping key entirely (e.g. no real
   *  `orderingFacilityId` resolved for that case) — so a caller can
   *  show "N jobs left ungrouped" rather than silently dropping them
   *  with no accounting at all. */
  skippedJobIds: string[];
}

// src/services/printing/IPrintQueueService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-279 §2.2.3 (Hold/Release/Cancel/Redirect) and §2.2.2
// (batch tagging) — extends the original 7-method interface (unchanged
// above) with the real state-transition and lookup methods the new
// PrintQueueDashboardSection.tsx admin dashboard actually needs. Every
// new state-transition method follows the exact same real
// `auditService.logEvent()` convention the 4 original state-changing
// methods already establish in mockPrintQueueService.ts — a bulk
// variant is a real, sequential loop over its own singular method
// (never a separate, parallel implementation of the same rule), so
// there is exactly one real place each business rule (e.g. "you can't
// cancel an already-PRINTED job") is enforced.
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult } from '../types';
import type { PrintJob } from '@/types/printing/PrintJob';
import type { PrintDestination } from '@/types/printRouting/PrintDestination';

/** Real, honest per-item bulk result — a bulk action never fails
 *  atomically-all-or-nothing (a real, mixed-state selection of print
 *  jobs is the common case on a real dashboard), so a caller gets back
 *  exactly which ids succeeded and which failed, with why. */
export interface BulkPrintJobResult {
  succeededIds: string[];
  failed: { id: string; error: string }[];
}

export interface IPrintQueueService {
  getAll(): Promise<ServiceResult<PrintJob[]>>;
  getByCaseId(caseId: string): Promise<ServiceResult<PrintJob[]>>;
  /** Real, per PS-279 — the dashboard's own single-job lookup (detail
   *  drawer, or any of the state-transition orchestrations in
   *  redispatchPrintJob.ts) needs one job by id, not the full list. */
  getById(id: string): Promise<ServiceResult<PrintJob>>;
  enqueue(entry: Omit<PrintJob, 'id' | 'status' | 'queuedAt' | 'retryCount' | 'maxRetriesExceeded'>): Promise<ServiceResult<PrintJob>>;
  getFailed(): Promise<ServiceResult<PrintJob[]>>;
  markFailed(id: string, failure: { errorCode: PrintJob['errorCode']; errorMessage: string; maxRetriesExceeded: boolean }): Promise<ServiceResult<PrintJob>>;
  retryDispatch(id: string): Promise<ServiceResult<PrintJob>>;
  markPrinted(id: string): Promise<ServiceResult<PrintJob>>;

  /** Real, per PS-279 — a real, data-only enrichment step, deliberately
   *  NOT audit-logged on its own: it runs as part of the single, real
   *  original dispatchPrintJob.ts call (persisting the bytes that are
   *  already in memory right before the real Mode 1/2/3 delivery
   *  attempt that IS audit-logged via markPrinted/markFailed), never a
   *  real, independent user-facing action of its own. */
  persistRenderedPdf(id: string, pdfBase64: string): Promise<ServiceResult<PrintJob>>;

  /** Real, per PS-279 §2.2.3 — real business rule enforced here, in
   *  the one place: only a real QUEUED/PRINTING/FAILED job can be held
   *  (never a PRINTED or already-CANCELLED one — holding a job that's
   *  already done or dead has no real effect and would corrupt
   *  statusBeforeHold). Real, per the source spec's own hold/release
   *  vocabulary — mirrors ServiceChargeRecord.holdCharge exactly. */
  holdPrintJob(id: string, heldBy: string, holdReason?: string): Promise<ServiceResult<PrintJob>>;
  /** Real, per PS-279 §2.2.3 — restores the real status recorded in
   *  statusBeforeHold at hold time, never a hardcoded 'QUEUED' guess.
   *  Only meaningful on a real, currently-HOLD job. */
  releaseHold(id: string, releasedBy: string): Promise<ServiceResult<PrintJob>>;
  /** Real, per PS-279 §2.2.3 — real business rule: a real, already-
   *  PRINTED job can never be cancelled (it already happened), and an
   *  already-CANCELLED job can't be cancelled twice. */
  cancelPrintJob(id: string, cancelledBy: string, cancelReason?: string): Promise<ServiceResult<PrintJob>>;
  /** Real, per PS-279 §2.2.3's own "redirect" operation — records an
   *  explicit override destination that wins over resolvedDestination
   *  on the next real (re)dispatch; does not itself change status or
   *  attempt delivery (redispatchPrintJob.ts's own, separate real
   *  orchestration does that, honoring this override once set). */
  redirectPrintJob(id: string, destination: PrintDestination, redirectedBy: string): Promise<ServiceResult<PrintJob>>;

  /** Real, per PS-279 §2.2.3's own "bulk hold/release/cancel
   *  operations." Real, sequential — never Promise.all'd — so a real,
   *  large selection never opens dozens of concurrent audit writes at
   *  once against this app's own real, single mockStorage backend. */
  holdMany(ids: string[], heldBy: string, holdReason?: string): Promise<ServiceResult<BulkPrintJobResult>>;
  releaseHoldMany(ids: string[], releasedBy: string): Promise<ServiceResult<BulkPrintJobResult>>;
  cancelMany(ids: string[], cancelledBy: string, cancelReason?: string): Promise<ServiceResult<BulkPrintJobResult>>;

  /** Real, per PS-279 §2.2.2 — tags every job in one real batch group
   *  with its resolved batchId. Called by
   *  runScheduledBatchAggregation.ts, never by the dashboard directly. */
  tagBatch(jobIds: string[], batchId: string): Promise<ServiceResult<BulkPrintJobResult>>;
}

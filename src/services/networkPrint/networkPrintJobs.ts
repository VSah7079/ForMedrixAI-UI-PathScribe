// src/services/networkPrint/networkPrintJobs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 347 (PS-54): what happened to the labels this tab sent to the
// interface engine ("Direct via Interface Engine" printers).
//
//   send()          sends a NetworkPrintPayload (dispatchNetworkPrintJob) and
//                   remembers it while the engine hasn't answered.
//   handleResult()  takes the engine's answer, which reaches the browser as a
//                   PrintJobStatus event on the live-update connection
//                   (engine → API server → SignalR hub → this tab). It audits
//                   the result and marks the job printed or failed.
//   retry()         resends a failed job, or one with no answer after
//                   REPLY_TIMEOUT_MS. It is manual only (Pete, Sep 26): an
//                   automatic retry could print twice when the label did
//                   print but the answer was lost. A retry keeps the
//                   idempotencyKey and gets a new eventId and attempt number,
//                   so an engine that enforces the key prints it at most once.
//   dismiss()       drops a job from the list.
//   simulateResult() demo only (no API server): publishes an engine answer on
//                   the local live-update transport, so the whole path runs.
//
// The live-update subscription is open only while a job is waiting. Jobs
// are kept in memory for this tab; after a reload, answers for earlier jobs
// are still audited by the server but no longer shown here.
// Audit detail stays literal English (services/auditlog/README.md).
// ─────────────────────────────────────────────────────────────────────────────

import type { NewAuditLog } from '../auditlog/IAuditService';
import type { LiveUpdateSubscription } from '../liveUpdates/ILiveUpdateService';
import type { PrintJobStatusCode, PrintJobStatusEvent } from '../liveUpdates/liveUpdateContract';
import type { NetworkPrintPayload } from '@/types/printing/NetworkPrintPayload';

/** A waiting job with no answer after this long can be retried. */
export const REPLY_TIMEOUT_MS = 120_000;
/** How long a printed job stays on screen. */
export const PRINTED_DISPLAY_MS = 5_000;

export type NetworkPrintJobState = 'waiting' | 'noReply' | 'printed' | 'failed';

export interface NetworkPrintJob {
  /** The current attempt's eventId (what the engine answers to). */
  jobId: string;
  idempotencyKey: string;
  attempt: number;
  printerId: string;
  accessionNumber: string;
  /** The block or slide id printed on the label. */
  labelId: string;
  labelType: 'CASSETTE' | 'SLIDE';
  state: NetworkPrintJobState;
  /** The engine's error, when failed. */
  errorCode: Exclude<PrintJobStatusCode, 'PRINT_SUCCESS'> | null;
  sentAt: string;
  /** Kept for a retry; never shown. */
  payload: NetworkPrintPayload;
}

export interface NetworkPrintJobDeps {
  dispatch: (payload: NetworkPrintPayload) => Promise<unknown>;
  audit: { logEvent(entry: NewAuditLog): Promise<unknown> };
  subscribeResults: (onEvent: (event: PrintJobStatusEvent) => void) => LiveUpdateSubscription;
  /** Present only when nothing but the demo can answer (no API server). */
  simulate?: (result: Omit<PrintJobStatusEvent, 'v' | 'eventId' | 'occurredAt'>) => void;
  currentUserName: () => string;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export type RetryOutcome = { ok: true; jobId: string } | { ok: false; reason: 'not_found' | 'not_retryable' };

export interface NetworkPrintJobTracker {
  send(payload: NetworkPrintPayload): Promise<NetworkPrintJob>;
  handleResult(event: PrintJobStatusEvent): 'applied' | 'unknown' | 'stale';
  retry(jobId: string): Promise<RetryOutcome>;
  dismiss(jobId: string): void;
  /** True when simulateResult can be used (demo, no API server). */
  readonly canSimulate: boolean;
  simulateResult(jobId: string, status: PrintJobStatusCode): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly NetworkPrintJob[];
}

/** Jobs that can be retried: failed, or no answer in time. */
export const isRetryable = (job: Pick<NetworkPrintJob, 'state'>) => job.state === 'failed' || job.state === 'noReply';

export function createNetworkPrintJobTracker(deps: NetworkPrintJobDeps): NetworkPrintJobTracker {
  const now = deps.now ?? (() => new Date());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
  const listeners = new Set<() => void>();
  const timers = new Map<string, unknown>();
  let jobs: readonly NetworkPrintJob[] = [];
  let subscription: LiveUpdateSubscription | null = null;

  const emit = () => { for (const l of [...listeners]) l(); };
  const clearJobTimer = (jobId: string) => {
    const t = timers.get(jobId);
    if (t !== undefined) { clearTimer(t); timers.delete(jobId); }
  };
  /** Listen for answers only while something is waiting for one. */
  const syncSubscription = () => {
    const waiting = jobs.some(j => j.state === 'waiting' || j.state === 'noReply');
    if (waiting && !subscription) subscription = deps.subscribeResults(e => { tracker.handleResult(e); });
    if (!waiting && subscription) { subscription.unsubscribe(); subscription = null; }
  };
  const setJobs = (next: readonly NetworkPrintJob[]) => { jobs = next; syncSubscription(); emit(); };
  const update = (jobId: string, change: Partial<NetworkPrintJob>) =>
    setJobs(jobs.map(j => (j.jobId === jobId ? { ...j, ...change } : j)));
  const remove = (jobId: string) => { clearJobTimer(jobId); setJobs(jobs.filter(j => j.jobId !== jobId)); };

  const startReplyTimer = (jobId: string) => {
    clearJobTimer(jobId);
    timers.set(jobId, setTimer(() => {
      timers.delete(jobId);
      if (jobs.some(j => j.jobId === jobId && j.state === 'waiting')) update(jobId, { state: 'noReply' });
    }, REPLY_TIMEOUT_MS));
  };

  const track = async (payload: NetworkPrintPayload, replacing?: string): Promise<NetworkPrintJob> => {
    const job: NetworkPrintJob = {
      jobId: payload.eventId,
      idempotencyKey: payload.idempotencyKey,
      attempt: payload.attempt ?? 1,
      printerId: payload.targetPrinter.printerId,
      accessionNumber: payload.labelData.accessionNumber,
      labelId: payload.labelData.blockId,
      labelType: payload.labelData.labelType ?? 'CASSETTE',
      state: 'waiting',
      errorCode: null,
      sentAt: now().toISOString(),
      payload,
    };
    // Listen before sending, so a fast answer isn't missed.
    if (replacing) { clearJobTimer(replacing); setJobs(jobs.map(j => (j.jobId === replacing ? job : j))); }
    else setJobs([...jobs, job]);
    startReplyTimer(job.jobId);
    await deps.dispatch(payload);
    return job;
  };

  const tracker: NetworkPrintJobTracker = {
    send: payload => track(payload),

    handleResult(event) {
      const job = jobs.find(j => j.jobId === event.jobId);
      if (!job) {
        // An earlier attempt of a job that was retried since: record it, change nothing.
        if (jobs.some(j => j.idempotencyKey === event.idempotencyKey)) return 'stale';
        return 'unknown';
      }
      if (job.state === 'printed' || job.state === 'failed') return 'stale'; // a duplicate answer
      const printed = event.status === 'PRINT_SUCCESS';
      void deps.audit.logEvent({
        type: 'system',
        event: printed ? 'Network Print Succeeded' : 'Network Print Failed',
        detail: `eventId=${event.jobId} idempotencyKey=${event.idempotencyKey} attempt=${job.attempt} status=${event.status} printerResponse="${event.printerResponse ?? ''}" durationMs=${event.durationMs ?? ''} printerId=${job.printerId}`,
        user: 'system',
        caseId: job.accessionNumber,
        confidence: null,
      }).catch(err => console.error('[networkPrint] could not audit the print result:', err));
      clearJobTimer(job.jobId);
      if (printed) {
        update(job.jobId, { state: 'printed', errorCode: null });
        timers.set(job.jobId, setTimer(() => { timers.delete(job.jobId); remove(job.jobId); }, PRINTED_DISPLAY_MS));
      } else {
        update(job.jobId, { state: 'failed', errorCode: event.status as NetworkPrintJob['errorCode'] });
      }
      return 'applied';
    },

    async retry(jobId) {
      const job = jobs.find(j => j.jobId === jobId);
      if (!job) return { ok: false, reason: 'not_found' };
      if (!isRetryable(job)) return { ok: false, reason: 'not_retryable' };
      const attempt = job.attempt + 1;
      const payload: NetworkPrintPayload = {
        ...job.payload,
        eventId: `${job.idempotencyKey}-R${attempt}`,
        attempt,
        timestamp: now().toISOString(),
      };
      void deps.audit.logEvent({
        type: 'user',
        event: 'Network Print Retried',
        detail: `Retried label ${job.labelId} on printer ${job.printerId} (previous eventId=${job.jobId}, ${job.state === 'failed' ? `failed with ${job.errorCode}` : 'no reply from the interface engine'}); new eventId=${payload.eventId} idempotencyKey=${job.idempotencyKey} attempt=${attempt}.`,
        user: deps.currentUserName(),
        caseId: job.accessionNumber,
        confidence: null,
      }).catch(err => console.error('[networkPrint] could not audit the retry:', err));
      await track(payload, job.jobId);
      return { ok: true, jobId: payload.eventId };
    },

    dismiss: jobId => remove(jobId),

    canSimulate: !!deps.simulate,
    simulateResult(jobId, status) {
      const job = jobs.find(j => j.jobId === jobId);
      if (!job || !deps.simulate) return;
      deps.simulate({
        jobId: job.jobId,
        idempotencyKey: job.idempotencyKey,
        status,
        printerResponse: status === 'PRINT_SUCCESS' ? 'OK (simulated)' : `${status} (simulated)`,
        durationMs: 0,
      });
    },

    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => jobs,
  };
  return tracker;
}

/** What the user sees for a job: the i18n key and its values. */
export function describeNetworkPrintJob(job: Pick<NetworkPrintJob, 'state' | 'errorCode' | 'printerId' | 'labelId'>): { key: string; values: Record<string, string> } {
  const values = { printer: job.printerId, label: job.labelId };
  switch (job.state) {
    case 'waiting': return { key: 'networkPrint.job.waiting', values };
    case 'noReply': return { key: 'networkPrint.job.noReply', values };
    case 'printed': return { key: 'networkPrint.job.printed', values };
    default: return { key: `networkPrint.job.failed.${job.errorCode ?? 'unknown'}`, values };
  }
}

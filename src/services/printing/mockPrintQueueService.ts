// src/services/printing/mockPrintQueueService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IPrintQueueService } from './IPrintQueueService';
import type { PrintJob } from '@/types/printing/PrintJob';
import { auditService } from '@/services';

const KEY = 'print_queue_v1';

const load    = (): PrintJob[] => storageGet<PrintJob[]>(KEY, []);
const persist = (data: PrintJob[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockPrintQueueService: IPrintQueueService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId) {
    await delay();
    return ok(load().filter(e => e.caseId === caseId));
  },

  async enqueue(entry) {
    await delay();
    const newEntry: PrintJob = {
      ...entry,
      id: crypto.randomUUID(),
      status: 'QUEUED',
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      maxRetriesExceeded: false,
    };
    persist([...load(), newEntry]);
    return ok(newEntry);
  },

  async getFailed() {
    await delay();
    return ok(load().filter(e => e.status === 'FAILED'));
  },

  async markFailed(id, failure) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Print job ${id} not found`);
    const prior = all[idx];
    const updated: PrintJob = {
      ...prior,
      status: 'FAILED',
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      maxRetriesExceeded: failure.maxRetriesExceeded,
      lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    // Real, per the source spec's own Use Case 2 ("the LIS Print
    // Spooler holds the job, alerts the LIS administrator") — same
    // real, permanent audit posture as
    // mockOutboundResultQueueService.ts's own markFailed: the moment
    // a print job genuinely fails, not only if it's later retried.
    auditService.logEvent({
      type: 'system',
      event: 'Print job failed',
      detail: `Print job ${id} (${prior.reportType}, ${prior.mode}) failed: ${failure.errorCode} — ${failure.errorMessage}`,
      user: 'system',
      caseId: prior.caseId,
      confidence: null,
    });
    return ok(updated);
  },

  async retryDispatch(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Print job ${id} not found`);
    const prior = all[idx];
    const updated: PrintJob = {
      ...prior,
      status: 'QUEUED',
      errorCode: undefined,
      errorMessage: undefined,
      maxRetriesExceeded: false,
      retryCount: prior.retryCount + 1,
      lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    auditService.logEvent({
      type: 'user',
      event: 'Print job re-queued',
      detail: `Print job ${id} (${prior.reportType}, ${prior.mode}) re-queued (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'} — ${prior.errorMessage ?? 'no further detail recorded'}`,
      user: 'system',
      caseId: prior.caseId,
      confidence: null,
    });
    return ok(updated);
  },

  async markPrinted(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Print job ${id} not found`);
    const prior = all[idx];
    const updated: PrintJob = {
      ...prior,
      status: 'PRINTED',
      errorCode: undefined,
      errorMessage: undefined,
      lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    auditService.logEvent({
      type: 'system',
      event: 'Print job completed',
      detail: `Print job ${id} (${prior.reportType}, ${prior.mode}) genuinely printed.`,
      user: 'system',
      caseId: prior.caseId,
      confidence: null,
    });
    return ok(updated);
  },
};

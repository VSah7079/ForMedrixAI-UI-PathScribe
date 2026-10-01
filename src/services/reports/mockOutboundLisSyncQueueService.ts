// src/services/reports/mockOutboundLisSyncQueueService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IOutboundLisSyncQueueService } from './IOutboundLisSyncQueueService';
import type { OutboundLisSyncQueueEntry } from '@/types/case/OutboundLisSyncQueueEntry';
import { auditService } from '@/services';

const KEY = 'outbound_lis_sync_queue_v1';

const load    = (): OutboundLisSyncQueueEntry[] => storageGet<OutboundLisSyncQueueEntry[]>(KEY, []);
const persist = (data: OutboundLisSyncQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockOutboundLisSyncQueueService: IOutboundLisSyncQueueService = {
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
    const newEntry: OutboundLisSyncQueueEntry = {
      ...entry,
      id: crypto.randomUUID(),
      status: 'QUEUED',
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      maxRetriesExceeded: false,
    };
    const all = load();
    persist([...all, newEntry]);
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
    if (idx === -1) return err(`Outbound LIS sync queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundLisSyncQueueEntry = {
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
    // Real, per direct follow-up ("We are logging interface errors
    // with human readable error messaging?"): the actual, original
    // failure now has a real, permanent audit record the moment it
    // happens — previously only retryDispatch() logged anything, so
    // a failure that was never retried left zero real audit trail at
    // all, only the live queue entry's own errorCode/errorMessage,
    // which gets silently overwritten on the next attempt.
    auditService.logEvent({
      type: 'system',
      event: 'Outbound LIS sync dispatch failed',
      detail: `LIS sync queue entry ${id} (${prior.kind}) dispatch failed: ${failure.errorCode} — ${failure.errorMessage}`,
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
    if (idx === -1) return err(`Outbound LIS sync queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundLisSyncQueueEntry = {
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
      event: 'Outbound LIS sync re-queued',
      detail: `LIS sync queue entry ${id} (${prior.kind}) re-queued for dispatch (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'} — ${prior.errorMessage ?? 'no further detail recorded'}`,
      user: 'system',
      caseId: prior.caseId,
      confidence: null,
    });
    return ok(updated);
  },

  async markSent(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Outbound LIS sync queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundLisSyncQueueEntry = {
      ...prior,
      status: 'SENT',
      errorCode: undefined,
      errorMessage: undefined,
      lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    auditService.logEvent({
      type: 'system',
      event: 'Outbound LIS sync dispatched',
      detail: `LIS sync queue entry ${id} (${prior.kind}) genuinely dispatched and accepted by the receiving interface.`,
      user: 'system',
      caseId: prior.caseId,
      confidence: null,
    });
    return ok(updated);
  },
};

// src/services/reports/mockOutboundResultQueueService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IOutboundResultQueueService } from './IOutboundResultQueueService';
import type { OutboundResultQueueEntry } from '@/types/case/OutboundResultQueueEntry';
import { auditService } from '@/services';

const KEY = 'outbound_result_queue_v1';

const load    = (): OutboundResultQueueEntry[] => storageGet<OutboundResultQueueEntry[]>(KEY, []);
const persist = (data: OutboundResultQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockOutboundResultQueueService: IOutboundResultQueueService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId) {
    await delay();
    return ok(load().filter(e => e.caseId === caseId));
  },

  async getByInstanceAndState(instanceId, resultState) {
    await delay();
    return ok(load().filter(e => e.instanceId === instanceId && e.resultState === resultState));
  },

  async enqueue(entry) {
    await delay();
    const newEntry: OutboundResultQueueEntry = {
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
    if (idx === -1) return err(`Outbound result queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundResultQueueEntry = {
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
      event: 'Outbound result dispatch failed',
      detail: `Result queue entry ${id} (${prior.resultState}) dispatch failed: ${failure.errorCode} — ${failure.errorMessage}`,
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
    if (idx === -1) return err(`Outbound result queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundResultQueueEntry = {
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
      event: 'Outbound result re-queued',
      detail: `Result queue entry ${id} (${prior.resultState}) re-queued for dispatch (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'} — ${prior.errorMessage ?? 'no further detail recorded'}`,
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
    if (idx === -1) return err(`Outbound result queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundResultQueueEntry = {
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
      event: 'Outbound result dispatched',
      detail: `Result queue entry ${id} (${prior.resultState}) genuinely dispatched and accepted by the receiving interface.`,
      user: 'system',
      caseId: prior.caseId,
      confidence: null,
    });
    return ok(updated);
  },
};

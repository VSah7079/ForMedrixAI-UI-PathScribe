// src/services/billing/mockOutboundChargeQueueService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IOutboundChargeQueueService } from './IOutboundChargeQueueService';
import type { OutboundChargeQueueEntry } from '@/types/billing/OutboundChargeQueueEntry';
import { auditService } from '@/services';

const KEY = 'outbound_charge_queue_v1';

const load    = (): OutboundChargeQueueEntry[] => storageGet<OutboundChargeQueueEntry[]>(KEY, []);
const persist = (data: OutboundChargeQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockOutboundChargeQueueService: IOutboundChargeQueueService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId) {
    await delay();
    return ok(load().filter(e => e.caseId === caseId));
  },

  async getByServiceChargeRecordIds(ids) {
    await delay();
    const idSet = new Set(ids);
    return ok(load().filter(e => idSet.has(e.serviceChargeRecordId)));
  },

  async enqueue(entry) {
    await delay();
    const newEntry: OutboundChargeQueueEntry = {
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
    if (idx === -1) return err(`Outbound charge queue entry ${id} not found`);
    const updated: OutboundChargeQueueEntry = {
      ...all[idx],
      status: 'FAILED',
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      maxRetriesExceeded: failure.maxRetriesExceeded,
      lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },

  async retryDispatch(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Outbound charge queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundChargeQueueEntry = {
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
    // Real, per direct guidance: "maintain an immutable audit log of
    // all manual edits and re-transmission attempts" - logged here,
    // in the one real service method every real DLQ retry action goes
    // through, rather than left to each UI caller to remember.
    auditService.logEvent({
      type: 'user',
      event: 'Outbound charge re-queued',
      detail: `Charge queue entry ${id} re-queued for dispatch (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'}`,
      user: 'system',
      caseId: prior.caseId,
      confidence: null,
    });
    return ok(updated);
  },
};

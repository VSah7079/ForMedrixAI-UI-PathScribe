// src/services/cancerRegistry/mockCancerRegistryOutboundQueueService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { ICancerRegistryOutboundQueueService } from './ICancerRegistryOutboundQueueService';
import type { CancerRegistryOutboundQueueEntry } from '@/types/case/CancerRegistryOutboundQueueEntry';
import { mockAuditService as auditService } from '@/services/auditlog/mockAuditService';

const KEY = 'cancer_registry_outbound_queue_v1';

const load = (): CancerRegistryOutboundQueueEntry[] => storageGet<CancerRegistryOutboundQueueEntry[]>(KEY, []);
const persist = (data: CancerRegistryOutboundQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockCancerRegistryOutboundQueueService: ICancerRegistryOutboundQueueService = {
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
    const newEntry: CancerRegistryOutboundQueueEntry = {
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
    if (idx === -1) return err(`Cancer registry outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: CancerRegistryOutboundQueueEntry = {
      ...prior, status: 'FAILED', errorCode: failure.errorCode, errorMessage: failure.errorMessage,
      maxRetriesExceeded: failure.maxRetriesExceeded, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Cancer registry report dispatch failed',
      detail: `Cancer registry (${prior.registryId}) queue entry ${id} dispatch failed: ${failure.errorCode} — ${failure.errorMessage}`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },

  async retryDispatch(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Cancer registry outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: CancerRegistryOutboundQueueEntry = {
      ...prior, status: 'QUEUED', errorCode: undefined, errorMessage: undefined,
      maxRetriesExceeded: false, retryCount: prior.retryCount + 1, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'user', event: 'Cancer registry report re-queued',
      detail: `Cancer registry (${prior.registryId}) queue entry ${id} re-queued for dispatch (attempt ${updated.retryCount}).`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },

  async markSent(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Cancer registry outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: CancerRegistryOutboundQueueEntry = {
      ...prior, status: 'SENT', errorCode: undefined, errorMessage: undefined, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Cancer registry report dispatched',
      detail: `Cancer registry (${prior.registryId}) queue entry ${id} genuinely dispatched and accepted.`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },
};

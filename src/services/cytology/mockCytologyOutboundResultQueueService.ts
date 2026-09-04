// src/services/cytology/mockCytologyOutboundResultQueueService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { ICytologyOutboundResultQueueService } from './ICytologyOutboundResultQueueService';
import type { CytologyOutboundResultQueueEntry } from '@/types/case/CytologyOutboundResultQueueEntry';
import { mockAuditService as auditService } from '@/services/auditlog/mockAuditService';

const KEY = 'cytology_outbound_result_queue_v1';

const load    = (): CytologyOutboundResultQueueEntry[] => storageGet<CytologyOutboundResultQueueEntry[]>(KEY, []);
const persist = (data: CytologyOutboundResultQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockCytologyOutboundResultQueueService: ICytologyOutboundResultQueueService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId) {
    await delay();
    return ok(load().filter(e => e.caseId === caseId));
  },

  async getBySignOutRecordId(signOutRecordId) {
    await delay();
    return ok(load().filter(e => e.signOutRecordId === signOutRecordId));
  },

  async enqueue(entry) {
    await delay();
    const newEntry: CytologyOutboundResultQueueEntry = {
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
    if (idx === -1) return err(`Cytology outbound result queue entry ${id} not found`);
    const prior = all[idx];
    const updated: CytologyOutboundResultQueueEntry = {
      ...prior, status: 'FAILED', errorCode: failure.errorCode, errorMessage: failure.errorMessage,
      maxRetriesExceeded: failure.maxRetriesExceeded, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Cytology outbound result dispatch failed',
      detail: `Cytology result queue entry ${id} dispatch failed: ${failure.errorCode} — ${failure.errorMessage}`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },

  async retryDispatch(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Cytology outbound result queue entry ${id} not found`);
    const prior = all[idx];
    const updated: CytologyOutboundResultQueueEntry = {
      ...prior, status: 'QUEUED', errorCode: undefined, errorMessage: undefined,
      maxRetriesExceeded: false, retryCount: prior.retryCount + 1, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'user', event: 'Cytology outbound result re-queued',
      detail: `Cytology result queue entry ${id} re-queued for dispatch (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'} — ${prior.errorMessage ?? 'no further detail recorded'}`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },

  async markSent(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Cytology outbound result queue entry ${id} not found`);
    const prior = all[idx];
    const updated: CytologyOutboundResultQueueEntry = {
      ...prior, status: 'SENT', errorCode: undefined, errorMessage: undefined, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Cytology outbound result dispatched',
      detail: `Cytology result queue entry ${id} genuinely dispatched and accepted by the receiving interface.`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },
};

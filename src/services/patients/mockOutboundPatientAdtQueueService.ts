// src/services/patients/mockOutboundPatientAdtQueueService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IOutboundPatientAdtQueueService } from './IOutboundPatientAdtQueueService';
import type { OutboundPatientAdtQueueEntry } from '@/types/patients/OutboundPatientAdtQueueEntry';
import { auditService } from '@/services';

const KEY = 'outbound_patient_adt_queue_v1';

const load    = (): OutboundPatientAdtQueueEntry[] => storageGet<OutboundPatientAdtQueueEntry[]>(KEY, []);
const persist = (data: OutboundPatientAdtQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockOutboundPatientAdtQueueService: IOutboundPatientAdtQueueService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByPatientId(patientId) {
    await delay();
    return ok(load().filter(e => e.sourcePatientId === patientId || e.targetPatientId === patientId));
  },

  async enqueue(entry) {
    await delay();
    const newEntry: OutboundPatientAdtQueueEntry = {
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
    if (idx === -1) return err(`Outbound patient ADT queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundPatientAdtQueueEntry = {
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
      event: 'Outbound patient ADT dispatch failed',
      detail: `Patient ADT queue entry ${id} (${prior.eventType}) dispatch failed: ${failure.errorCode} — ${failure.errorMessage}`,
      user: 'system',
      caseId: null,
      confidence: null,
    });
    return ok(updated);
  },

  async retryDispatch(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Outbound patient ADT queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundPatientAdtQueueEntry = {
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
    // Real, per direct guidance, same reasoning as the billing queue's
    // own retryDispatch: an immutable audit trail of every manual
    // re-transmission attempt, logged in the one real service method
    // every real retry goes through.
    auditService.logEvent({
      type: 'user',
      event: 'Outbound patient ADT re-queued',
      detail: `Patient ADT queue entry ${id} (${prior.eventType}) re-queued for dispatch (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'} — ${prior.errorMessage ?? 'no further detail recorded'}`,
      user: 'system',
      caseId: null,
      confidence: null,
    });
    return ok(updated);
  },

  async markSent(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Outbound patient ADT queue entry ${id} not found`);
    const prior = all[idx];
    const updated: OutboundPatientAdtQueueEntry = {
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
      event: 'Outbound patient ADT dispatched',
      detail: `Patient ADT queue entry ${id} (${prior.eventType}) genuinely dispatched and accepted by the receiving interface.`,
      user: 'system',
      caseId: null,
      confidence: null,
    });
    return ok(updated);
  },
};

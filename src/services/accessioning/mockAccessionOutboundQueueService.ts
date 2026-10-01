// src/services/accessioning/mockAccessionOutboundQueueService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors mockCytologyOutboundResultQueueService.ts's own real,
// established implementation exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IAccessionOutboundQueueService } from './IAccessionOutboundQueueService';
import type { AccessionOutboundQueueEntry } from '@/types/case/AccessionOutboundQueueEntry';
import { mockAuditService as auditService } from '@/services/auditlog/mockAuditService';

const KEY = 'accession_outbound_queue_v1';

const load    = (): AccessionOutboundQueueEntry[] => storageGet<AccessionOutboundQueueEntry[]>(KEY, []);
const persist = (data: AccessionOutboundQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockAccessionOutboundQueueService: IAccessionOutboundQueueService = {
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
    const newEntry: AccessionOutboundQueueEntry = {
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
    if (idx === -1) return err(`Accession outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: AccessionOutboundQueueEntry = {
      ...prior, status: 'FAILED', errorCode: failure.errorCode, errorMessage: failure.errorMessage,
      maxRetriesExceeded: failure.maxRetriesExceeded, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Accession outbound dispatch failed',
      detail: `Accession outbound queue entry ${id} (${prior.eventType}) dispatch failed: ${failure.errorCode} — ${failure.errorMessage}`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },

  async retryDispatch(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Accession outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: AccessionOutboundQueueEntry = {
      ...prior, status: 'QUEUED', errorCode: undefined, errorMessage: undefined,
      maxRetriesExceeded: false, retryCount: prior.retryCount + 1, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'user', event: 'Accession outbound entry re-queued',
      detail: `Accession outbound queue entry ${id} (${prior.eventType}) re-queued for dispatch (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'} — ${prior.errorMessage ?? 'no further detail recorded'}`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },

  async markSent(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Accession outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: AccessionOutboundQueueEntry = {
      ...prior, status: 'SENT', errorCode: undefined, errorMessage: undefined, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Accession outbound entry dispatched',
      detail: `Accession outbound queue entry ${id} (${prior.eventType}) genuinely dispatched and accepted by the receiving interface.`,
      user: 'system', caseId: prior.caseId, confidence: null,
    });
    return ok(updated);
  },
};

// src/services/referral/mockReferralOutboundQueueService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors mockAccessionOutboundQueueService.ts's own real,
// established implementation exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IReferralOutboundQueueService, ReferralOutboundQueueEntry } from './IReferralOutboundQueueService';
import { mockAuditService as auditService } from '@/services/auditlog/mockAuditService';

const KEY = 'referral_outbound_queue_v1';

const load    = (): ReferralOutboundQueueEntry[] => storageGet<ReferralOutboundQueueEntry[]>(KEY, []);
const persist = (data: ReferralOutboundQueueEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockReferralOutboundQueueService: IReferralOutboundQueueService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByBatchId(batchId) {
    await delay();
    return ok(load().filter(e => e.batchId === batchId));
  },

  async enqueue(entry) {
    await delay();
    const newEntry: ReferralOutboundQueueEntry = {
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
    if (idx === -1) return err(`Referral outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: ReferralOutboundQueueEntry = {
      ...prior, status: 'FAILED', errorCode: failure.errorCode, errorMessage: failure.errorMessage,
      maxRetriesExceeded: failure.maxRetriesExceeded, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Referral outbound dispatch failed',
      detail: `Referral outbound queue entry ${id} (batch ${prior.batchId}) dispatch failed: ${failure.errorCode} — ${failure.errorMessage}`,
      user: 'system', caseId: prior.batchId, confidence: null,
    });
    return ok(updated);
  },

  async retryDispatch(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Referral outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: ReferralOutboundQueueEntry = {
      ...prior, status: 'QUEUED', errorCode: undefined, errorMessage: undefined,
      maxRetriesExceeded: false, retryCount: prior.retryCount + 1, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'user', event: 'Referral outbound entry re-queued',
      detail: `Referral outbound queue entry ${id} (batch ${prior.batchId}) re-queued for dispatch (attempt ${updated.retryCount}), was: ${prior.errorCode ?? 'unknown error'} — ${prior.errorMessage ?? 'no further detail recorded'}`,
      user: 'system', caseId: prior.batchId, confidence: null,
    });
    return ok(updated);
  },

  async markSent(id) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Referral outbound queue entry ${id} not found`);
    const prior = all[idx];
    const updated: ReferralOutboundQueueEntry = {
      ...prior, status: 'SENT', errorCode: undefined, errorMessage: undefined, lastAttemptAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    auditService.logEvent({
      type: 'system', event: 'Referral outbound entry dispatched',
      detail: `Referral outbound queue entry ${id} (batch ${prior.batchId}) genuinely dispatched and accepted by the receiving reference lab interface.`,
      user: 'system', caseId: prior.batchId, confidence: null,
    });
    return ok(updated);
  },
};

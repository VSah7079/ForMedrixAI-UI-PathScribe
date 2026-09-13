// src/services/cytology/mockCytologyWorkloadLedgerService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { ICytologyWorkloadLedgerService } from './ICytologyWorkloadLedgerService';
import type { CytologyWorkloadLedgerEntry } from '@/types/cytology/CytologyWorkloadLedgerEntry';
import { mockAuditService as auditService } from '@/services/auditlog/mockAuditService';

const KEY = 'cytology_workload_ledger_v1';

const load    = (): CytologyWorkloadLedgerEntry[] => storageGet<CytologyWorkloadLedgerEntry[]>(KEY, []);
const persist = (data: CytologyWorkloadLedgerEntry[]) => storageSet(KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 40));

export const mockCytologyWorkloadLedgerService: ICytologyWorkloadLedgerService = {
  async record(entry) {
    await delay();
    const newEntry: CytologyWorkloadLedgerEntry = { ...entry, id: crypto.randomUUID() };
    persist([...load(), newEntry]);
    // Real, per direct guidance's own "Database Schema for CLIA Audit
    // Compliance" requirement — every real ledger entry is also a
    // real, queryable audit event, matching this module's own
    // established audit-log pattern (QC selection, registry dispatch).
    auditService.logEvent({
      type: 'system', event: 'Cytology workload ledger entry recorded',
      detail: `User ${entry.userId} recorded a real ${entry.reviewMode} review (${entry.scuWeight} SCU, ${entry.activeDurationSeconds}s active) on case ${entry.caseId}.`,
      user: entry.userId, caseId: entry.caseId, confidence: null,
    });
    return ok(newEntry);
  },

  async getForUserInWindow(userId, windowStart, windowEnd) {
    await delay();
    return ok(load().filter(e => e.userId === userId && e.completedAt >= windowStart && e.completedAt <= windowEnd));
  },

  async getAll() {
    await delay();
    return ok(load());
  },
};

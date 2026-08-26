// src/services/billing/mockCodeReviewPoolService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { ICodeReviewPoolService } from './ICodeReviewPoolService';
import type { CodeReviewPoolEntry } from '@/types/billing/CodeReviewPoolEntry';

const KEY = 'code_review_pool_v1';

const load    = (): CodeReviewPoolEntry[] => storageGet<CodeReviewPoolEntry[]>(KEY, []);
const persist = (data: CodeReviewPoolEntry[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 80));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockCodeReviewPoolService: ICodeReviewPoolService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId) {
    await delay();
    return ok(load().filter(e => e.caseId === caseId));
  },

  async create(entry) {
    await delay();
    const newEntry: CodeReviewPoolEntry = {
      ...entry,
      id: crypto.randomUUID(),
      status: 'PENDING_REVIEW',
      flaggedAt: new Date().toISOString(),
    };
    const all = load();
    persist([...all, newEntry]);
    return ok(newEntry);
  },

  async review(id, outcome) {
    await delay();
    const all = load();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return err(`Code review pool entry ${id} not found`);
    const updated: CodeReviewPoolEntry = {
      ...all[idx],
      status: 'REVIEWED',
      reviewOutcome: outcome.reviewOutcome,
      reviewedBy: outcome.reviewedBy,
      reviewedByName: outcome.reviewedByName,
      reviewedAt: new Date().toISOString(),
      raisedDeficiencyId: outcome.raisedDeficiencyId,
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },
};

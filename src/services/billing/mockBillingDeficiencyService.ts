// src/services/billing/mockBillingDeficiencyService.ts
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';
import type { IBillingDeficiencyService } from './IBillingDeficiencyService';
import type { BillingDeficiencyRecord } from '@/types/billing/BillingDeficiencyRecord';

const KEY = 'billing_deficiency_records_v1';

const load    = (): BillingDeficiencyRecord[] => storageGet<BillingDeficiencyRecord[]>(KEY, []);
const persist = (data: BillingDeficiencyRecord[]) => storageSet(KEY, data);

const delay = () => new Promise(r => setTimeout(r, 120));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockBillingDeficiencyService: IBillingDeficiencyService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByCaseId(caseId) {
    await delay();
    return ok(load().filter(d => d.caseId === caseId));
  },

  async raise(deficiency) {
    await delay();
    const newRecord: BillingDeficiencyRecord = {
      ...deficiency,
      id: 'bdef-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    const all = load();
    persist([...all, newRecord]);
    return ok(newRecord);
  },

  async resolve(id, resolution) {
    await delay();
    const all = load();
    const idx = all.findIndex(d => d.id === id);
    if (idx === -1) return err(`Billing deficiency ${id} not found`);
    const updated: BillingDeficiencyRecord = {
      ...all[idx],
      status: 'RESOLVED',
      resolutionReasonCode: resolution.resolutionReasonCode,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    persist(next);
    return ok(updated);
  },
};

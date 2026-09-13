// src/services/referral/mockReferralTrackingService.ts
import type { IReferralTrackingService, ReferralTracking, ReferralTransitStatus } from './IReferralTrackingService';
import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const KEY = 'referral_tracking_v1';

const load = (): ReferralTracking[] => storageGet(KEY, []);
const persist = (data: ReferralTracking[]) => storageSet(KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockReferralTrackingService: IReferralTrackingService = {
  async getAll() {
    await delay();
    return ok(load());
  },

  async getByBatchId(batchId: string) {
    await delay();
    return ok(load().find(t => t.batchId === batchId) ?? null);
  },

  async createOnDispatch(batchId: string) {
    await delay();
    const all = load();
    if (all.some(t => t.batchId === batchId)) {
      return err(`A referral tracking record already exists for batch "${batchId}"`);
    }
    const created: ReferralTracking = {
      id: crypto.randomUUID(), batchId, transitStatus: 'dispatched', lastUpdatedAt: new Date().toISOString(),
    };
    persist([...all, created]);
    return ok({ ...created });
  },

  async updateTransitStatus(batchId: string, status: ReferralTransitStatus) {
    await delay();
    const all = load();
    const idx = all.findIndex(t => t.batchId === batchId);
    if (idx === -1) return err(`No referral tracking record found for batch "${batchId}"`);
    const updated: ReferralTracking = { ...all[idx], transitStatus: status, lastUpdatedAt: new Date().toISOString() };
    const next = [...all]; next[idx] = updated; persist(next);
    return ok({ ...updated });
  },

  async recordResult(batchId: string, result) {
    await delay();
    const all = load();
    const idx = all.findIndex(t => t.batchId === batchId);
    if (idx === -1) return err(`No referral tracking record found for batch "${batchId}"`);
    const updated: ReferralTracking = {
      ...all[idx], transitStatus: 'result_received', lastUpdatedAt: new Date().toISOString(),
      resultType: result.resultType, discreteResult: result.discreteResult, pdfAttachmentUrl: result.pdfAttachmentUrl,
      receivedAt: new Date().toISOString(),
    };
    const next = [...all]; next[idx] = updated; persist(next);
    return ok({ ...updated });
  },
};

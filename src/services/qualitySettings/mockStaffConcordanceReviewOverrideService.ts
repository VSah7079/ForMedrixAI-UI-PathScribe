// src/services/qualitySettings/mockStaffConcordanceReviewOverrideService.ts
import type { IStaffConcordanceReviewOverrideService, StaffConcordanceReviewOverride } from './IStaffConcordanceReviewOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'staffConcordanceReviewOverrides';

const load    = (): StaffConcordanceReviewOverride[] => storageGet<StaffConcordanceReviewOverride[]>(STORAGE_KEY, []);
const persist = (data: StaffConcordanceReviewOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockStaffConcordanceReviewOverrideService: IStaffConcordanceReviewOverrideService = {
  async getForStaff(staffUserId) {
    await delay();
    const record = load().find(r => r.staffUserId === staffUserId);
    return ok(record ? { ...record } : null);
  },

  async create(staffUserId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.staffUserId === staffUserId)) {
      return err(`Staff member ${staffUserId} already has a Concordance Review settings override — update it instead of creating a second one.`);
    }
    const now = new Date().toISOString();
    const newRecord: StaffConcordanceReviewOverride = {
      id: 'staff-concordance-' + Date.now(), staffUserId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },

  async update(staffUserId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.staffUserId === staffUserId);
    if (idx === -1) return err(`Staff member ${staffUserId} has no Concordance Review settings override to update — create one first.`);
    const updated: StaffConcordanceReviewOverride = {
      ...records[idx], overrides: { ...records[idx].overrides, ...changes }, updatedAt: new Date().toISOString(),
    };
    const withUpdate = [...records];
    withUpdate[idx] = updated;
    persist(withUpdate);
    return ok({ ...updated });
  },

  async remove(staffUserId) {
    await delay();
    persist(load().filter(r => r.staffUserId !== staffUserId));
    return { ok: true, data: undefined };
  },
};

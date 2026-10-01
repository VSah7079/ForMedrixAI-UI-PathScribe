// src/services/cytology/mockStaffCytologyQcOverrideService.ts
import type { IStaffCytologyQcOverrideService, StaffCytologyQcOverride } from './IStaffCytologyQcOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'staffCytologyQcOverrides';

const load    = (): StaffCytologyQcOverride[] => storageGet<StaffCytologyQcOverride[]>(STORAGE_KEY, []);
const persist = (data: StaffCytologyQcOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockStaffCytologyQcOverrideService: IStaffCytologyQcOverrideService = {
  async getForStaff(staffUserId) {
    await delay();
    const record = load().find(r => r.staffUserId === staffUserId);
    return ok(record ? { ...record } : null);
  },

  async create(staffUserId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.staffUserId === staffUserId)) {
      return err(`Staff member ${staffUserId} already has a Cytology QC settings override — update it instead of creating a second one.`);
    }
    const now = new Date().toISOString();
    const newRecord: StaffCytologyQcOverride = {
      id: 'staff-qc-' + Date.now(), staffUserId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },

  async update(staffUserId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.staffUserId === staffUserId);
    if (idx === -1) return err(`Staff member ${staffUserId} has no Cytology QC settings override to update — create one first.`);
    const updated: StaffCytologyQcOverride = {
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

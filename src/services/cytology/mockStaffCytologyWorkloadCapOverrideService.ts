// src/services/cytology/mockStaffCytologyWorkloadCapOverrideService.ts
import type { IStaffCytologyWorkloadCapOverrideService, StaffCytologyWorkloadCapOverride } from './IStaffCytologyWorkloadCapOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'staffCytologyWorkloadCapOverrides';

const load    = (): StaffCytologyWorkloadCapOverride[] => storageGet<StaffCytologyWorkloadCapOverride[]>(STORAGE_KEY, []);
const persist = (data: StaffCytologyWorkloadCapOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockStaffCytologyWorkloadCapOverrideService: IStaffCytologyWorkloadCapOverrideService = {
  async getForStaff(staffUserId) {
    await delay();
    const record = load().find(r => r.staffUserId === staffUserId);
    return ok(record ? { ...record } : null);
  },
  async create(staffUserId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.staffUserId === staffUserId)) {
      return err(`Staff member ${staffUserId} already has a Cytology workload cap override — update it instead.`);
    }
    const now = new Date().toISOString();
    const newRecord: StaffCytologyWorkloadCapOverride = {
      id: 'staff-workload-cap-' + Date.now(), staffUserId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },
  async update(staffUserId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.staffUserId === staffUserId);
    if (idx === -1) return err(`Staff member ${staffUserId} has no Cytology workload cap override to update — create one first.`);
    const updated: StaffCytologyWorkloadCapOverride = {
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

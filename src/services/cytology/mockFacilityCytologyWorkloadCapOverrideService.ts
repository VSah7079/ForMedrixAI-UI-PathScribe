// src/services/cytology/mockFacilityCytologyWorkloadCapOverrideService.ts
import type { IFacilityCytologyWorkloadCapOverrideService, FacilityCytologyWorkloadCapOverride } from './IFacilityCytologyWorkloadCapOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'facilityCytologyWorkloadCapOverrides';

const load    = (): FacilityCytologyWorkloadCapOverride[] => storageGet<FacilityCytologyWorkloadCapOverride[]>(STORAGE_KEY, []);
const persist = (data: FacilityCytologyWorkloadCapOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockFacilityCytologyWorkloadCapOverrideService: IFacilityCytologyWorkloadCapOverrideService = {
  async getForFacility(facilityId) {
    await delay();
    const record = load().find(r => r.facilityId === facilityId);
    return ok(record ? { ...record } : null);
  },
  async create(facilityId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.facilityId === facilityId)) {
      return err(`Facility ${facilityId} already has a Cytology workload cap override — update it instead.`);
    }
    const now = new Date().toISOString();
    const newRecord: FacilityCytologyWorkloadCapOverride = {
      id: 'fac-workload-cap-' + Date.now(), facilityId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },
  async update(facilityId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.facilityId === facilityId);
    if (idx === -1) return err(`Facility ${facilityId} has no Cytology workload cap override to update — create one first.`);
    const updated: FacilityCytologyWorkloadCapOverride = {
      ...records[idx], overrides: { ...records[idx].overrides, ...changes }, updatedAt: new Date().toISOString(),
    };
    const withUpdate = [...records];
    withUpdate[idx] = updated;
    persist(withUpdate);
    return ok({ ...updated });
  },
  async remove(facilityId) {
    await delay();
    persist(load().filter(r => r.facilityId !== facilityId));
    return { ok: true, data: undefined };
  },
};

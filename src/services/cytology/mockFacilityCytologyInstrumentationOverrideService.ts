// src/services/cytology/mockFacilityCytologyInstrumentationOverrideService.ts
import type { IFacilityCytologyInstrumentationOverrideService, FacilityCytologyInstrumentationOverride } from './IFacilityCytologyInstrumentationOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'facilityCytologyInstrumentationOverrides';

const load    = (): FacilityCytologyInstrumentationOverride[] => storageGet<FacilityCytologyInstrumentationOverride[]>(STORAGE_KEY, []);
const persist = (data: FacilityCytologyInstrumentationOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockFacilityCytologyInstrumentationOverrideService: IFacilityCytologyInstrumentationOverrideService = {
  async getForFacility(facilityId) {
    await delay();
    const record = load().find(r => r.facilityId === facilityId);
    return ok(record ? { ...record } : null);
  },

  async create(facilityId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.facilityId === facilityId)) {
      return err(`Facility ${facilityId} already has a Cytology Instrumentation override — update it instead of creating a second one.`);
    }
    const now = new Date().toISOString();
    const newRecord: FacilityCytologyInstrumentationOverride = {
      id: 'fac-instrumentation-' + Date.now(), facilityId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },

  async update(facilityId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.facilityId === facilityId);
    if (idx === -1) return err(`Facility ${facilityId} has no Cytology Instrumentation override to update — create one first.`);
    const updated: FacilityCytologyInstrumentationOverride = {
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

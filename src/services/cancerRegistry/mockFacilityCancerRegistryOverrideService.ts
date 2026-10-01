// src/services/cancerRegistry/mockFacilityCancerRegistryOverrideService.ts
// Real, per direct guidance's own established pattern — mirrors
// mockFacilityCytologyRegistryOverrideService.ts's exact CRUD shape.
// Deliberately no seed data: unlike the cytology screening-registry
// work (which had real, direct research confirming specific existing
// seed facilities' own real jurisdictions), no such research was done
// here to assign any of this app's existing seed facilities to a
// specific real cancer registry — fabricating one would misrepresent
// a real, researched fact as one that was actually confirmed.
import type { IFacilityCancerRegistryOverrideService, FacilityCancerRegistryOverride } from './IFacilityCancerRegistryOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'facilityCancerRegistryOverrides';

const load = (): FacilityCancerRegistryOverride[] => storageGet<FacilityCancerRegistryOverride[]>(STORAGE_KEY, []);
const persist = (data: FacilityCancerRegistryOverride[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockFacilityCancerRegistryOverrideService: IFacilityCancerRegistryOverrideService = {
  async getForFacility(facilityId) {
    await delay();
    const record = load().find(r => r.facilityId === facilityId);
    return ok(record ? { ...record } : null);
  },
  async create(facilityId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.facilityId === facilityId)) {
      return err(`Facility ${facilityId} already has a Cancer Registry settings override — update it instead.`);
    }
    const now = new Date().toISOString();
    const newRecord: FacilityCancerRegistryOverride = {
      id: 'fac-cancer-registry-' + Date.now(), facilityId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },
  async update(facilityId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.facilityId === facilityId);
    if (idx === -1) return err(`Facility ${facilityId} has no Cancer Registry settings override to update — create one first.`);
    const updated: FacilityCancerRegistryOverride = {
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

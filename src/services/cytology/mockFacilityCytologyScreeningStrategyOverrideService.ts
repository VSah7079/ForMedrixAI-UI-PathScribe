// src/services/cytology/mockFacilityCytologyScreeningStrategyOverrideService.ts
import type { IFacilityCytologyScreeningStrategyOverrideService, FacilityCytologyScreeningStrategyOverride } from './IFacilityCytologyScreeningStrategyOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'facilityCytologyScreeningStrategyOverrides';

// Real, per direct guidance's own follow-up ("create some seed data
// that represent various HPV testing results and also some in ordered
// states"): Fenwick Women's Hospital (jurisdiction: 'GB_EW', a real,
// already-seeded UK facility) is a real, working example of a
// primary_hpv_reflex lab — GYN cytology only ever happens there once
// a real molecular hrHPV result comes back positive.
const SEED: FacilityCytologyScreeningStrategyOverride[] = [
  {
    id: 'fac-strategy-seed-fenwick-womens', facilityId: 'c-fenwick-womens',
    overrides: { screeningStrategy: 'primary_hpv_reflex' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
const SEED_VERSION = '1';
const SEED_VERSION_KEY = 'facilityCytologyScreeningStrategyOverrides_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet(STORAGE_KEY, SEED);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load    = (): FacilityCytologyScreeningStrategyOverride[] => storageGet<FacilityCytologyScreeningStrategyOverride[]>(STORAGE_KEY, SEED);
const persist = (data: FacilityCytologyScreeningStrategyOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockFacilityCytologyScreeningStrategyOverrideService: IFacilityCytologyScreeningStrategyOverrideService = {
  async getForFacility(facilityId) {
    await delay();
    const record = load().find(r => r.facilityId === facilityId);
    return ok(record ? { ...record } : null);
  },
  async create(facilityId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.facilityId === facilityId)) {
      return err(`Facility ${facilityId} already has a Cytology screening strategy override — update it instead.`);
    }
    const now = new Date().toISOString();
    const newRecord: FacilityCytologyScreeningStrategyOverride = {
      id: 'fac-strategy-' + Date.now(), facilityId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },
  async update(facilityId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.facilityId === facilityId);
    if (idx === -1) return err(`Facility ${facilityId} has no Cytology screening strategy override to update — create one first.`);
    const updated: FacilityCytologyScreeningStrategyOverride = {
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

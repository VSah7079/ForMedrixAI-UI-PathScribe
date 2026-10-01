// src/services/cytology/mockFacilityCytologyRegistryOverrideService.ts
import type { IFacilityCytologyRegistryOverrideService, FacilityCytologyRegistryOverride } from './IFacilityCytologyRegistryOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'facilityCytologyRegistryOverrides';

// Real, per direct guidance: South Korea belongs in the Centralized
// Registry bucket, reporting to KNCSP/KCCR. Fenwick General Hospital
// (c-fenwick-general — the real, existing UK facility, sibling to
// c-fenwick-womens which already carries the UK screening-strategy/
// nomenclature overrides) is deliberately NOT used here — Korea needs
// its own, separate, real facility; c-fenwick-general is left free
// for the UK's own real Call 18 registry work when that phase is
// actually built. See mockCaseService.ts's own seed data for the real
// Korean facility this module uses instead.
const SEED: FacilityCytologyRegistryOverride[] = [
  {
    id: 'fac-registry-seed-seoul-general', facilityId: 'c-kr-seoul-general',
    overrides: { registryId: 'kncsp_kccr_korea' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own research correction: England's
    // real system is CSMS, not the "Call 18" misnomer.
    id: 'fac-registry-seed-fenwick-womens', facilityId: 'c-fenwick-womens',
    overrides: { registryId: 'csms_uk' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct research: Ireland's own real registry is
    // CervicalCheck itself.
    id: 'fac-registry-seed-ncsl-dublin', facilityId: 'c-ie-ncsl-dublin',
    overrides: { registryId: 'cervicalcheck_ireland' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct research: the Netherlands' own real registry
    // is PALGA itself — the same PALGA already identified in the
    // CISOE-A work (PS-183). Real, deliberate: unlike the other three
    // real registries, this one carries the real, native CisoeAScore
    // as its own real registryExtension (buildCytologyRegistryReportPayload.ts).
    id: 'fac-registry-seed-amsterdam-cyto', facilityId: 'c-nl-amsterdam-cyto',
    overrides: { registryId: 'palga_netherlands' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct research: Australia's own real registry is the
    // NCSR — carries its own real, LOINC-coded squamous result code
    // (resolveNcsrSquamousResultCode.ts).
    id: 'fac-registry-seed-sydney-cyto', facilityId: 'c-au-sydney-cyto',
    overrides: { registryId: 'ncsr_australia' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
const SEED_VERSION = '6'; // bumped: real, new Australian facility (c-au-sydney-cyto) registry override added — NCSR.
const SEED_VERSION_KEY = 'facilityCytologyRegistryOverrides_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet(STORAGE_KEY, SEED);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load    = (): FacilityCytologyRegistryOverride[] => storageGet<FacilityCytologyRegistryOverride[]>(STORAGE_KEY, SEED);
const persist = (data: FacilityCytologyRegistryOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockFacilityCytologyRegistryOverrideService: IFacilityCytologyRegistryOverrideService = {
  async getForFacility(facilityId) {
    await delay();
    const record = load().find(r => r.facilityId === facilityId);
    return ok(record ? { ...record } : null);
  },
  async create(facilityId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.facilityId === facilityId)) {
      return err(`Facility ${facilityId} already has a Cytology registry settings override — update it instead.`);
    }
    const now = new Date().toISOString();
    const newRecord: FacilityCytologyRegistryOverride = {
      id: 'fac-registry-' + Date.now(), facilityId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },
  async update(facilityId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.facilityId === facilityId);
    if (idx === -1) return err(`Facility ${facilityId} has no Cytology registry settings override to update — create one first.`);
    const updated: FacilityCytologyRegistryOverride = {
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

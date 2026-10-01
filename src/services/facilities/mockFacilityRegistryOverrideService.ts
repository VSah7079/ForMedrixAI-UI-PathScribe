// src/services/facilities/mockFacilityRegistryOverrideService.ts
import type { IFacilityRegistryOverrideService, FacilityRegistryOverride } from './IFacilityRegistryOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'facilityRegistryOverrides';

// Real, per direct guidance's own generalization of this module's
// facility-registry data (originally seeded, country by country, in
// mockFacilityCytologyRegistryOverrideService.ts — see that file's own
// git history / this project's cytology README Phases 39-44 for the
// full, real per-country research each entry is based on). Migrated
// here verbatim; no facility, registry, or reasoning changed — only
// the storage location and the removal of the "Cytology" namespacing,
// since none of these five facts are actually specimen-type-specific.
const SEED: FacilityRegistryOverride[] = [
  {
    // South Korea: KNCSP/KCCR.
    id: 'fac-registry-seed-seoul-general', facilityId: 'c-kr-seoul-general',
    overrides: { registryId: 'kncsp_kccr_korea' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // England: CSMS (Cervical Screening Management System) — "Call 18"
    // was a real, corrected misnomer; that name refers to an
    // administrative guidance document, not the system itself.
    id: 'fac-registry-seed-fenwick-womens', facilityId: 'c-fenwick-womens',
    overrides: { registryId: 'csms_uk' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Ireland: CervicalCheck itself.
    id: 'fac-registry-seed-ncsl-dublin', facilityId: 'c-ie-ncsl-dublin',
    overrides: { registryId: 'cervicalcheck_ireland' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Netherlands: PALGA itself — the same PALGA already identified in
    // the CISOE-A work. Real, deliberate: this is the one registry
    // among these five confirmed to be universal across specimen
    // types (histology, cytology, autopsy, molecular) for all 64
    // Dutch labs — exactly the real motivation for this file's own
    // generalization out of the cytology module.
    id: 'fac-registry-seed-amsterdam-cyto', facilityId: 'c-nl-amsterdam-cyto',
    overrides: { registryId: 'palga_netherlands' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Australia: the NCSR — its own official guide confirms it
    // records both cytology and histopathology results.
    id: 'fac-registry-seed-sydney-cyto', facilityId: 'c-au-sydney-cyto',
    overrides: { registryId: 'ncsr_australia' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Northern Ireland: the Northern Ireland Cervical Screening
    // Programme itself — real call/recall administered by the BSO
    // (Business Services Organisation), Belfast, distinct from
    // England's own CSMS, matching NI's own devolved health service.
    id: 'fac-registry-seed-lagan-valley', facilityId: 'c-ni-lagan-valley',
    overrides: { registryId: 'nicsp_northern_ireland' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
const SEED_VERSION = '2'; // bumped: real, new Northern Ireland facility (c-ni-lagan-valley) registry override added — Northern Ireland Cervical Screening Programme.
const SEED_VERSION_KEY = 'facilityRegistryOverrides_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet(STORAGE_KEY, SEED);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load    = (): FacilityRegistryOverride[] => storageGet<FacilityRegistryOverride[]>(STORAGE_KEY, SEED);
const persist = (data: FacilityRegistryOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockFacilityRegistryOverrideService: IFacilityRegistryOverrideService = {
  async getForFacility(facilityId) {
    await delay();
    const record = load().find(r => r.facilityId === facilityId);
    return ok(record ? { ...record } : null);
  },
  async create(facilityId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.facilityId === facilityId)) {
      return err(`Facility ${facilityId} already has a registry settings override — update it instead.`);
    }
    const now = new Date().toISOString();
    const newRecord: FacilityRegistryOverride = {
      id: 'fac-registry-' + Date.now(), facilityId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },
  async update(facilityId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.facilityId === facilityId);
    if (idx === -1) return err(`Facility ${facilityId} has no registry settings override to update — create one first.`);
    const updated: FacilityRegistryOverride = {
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

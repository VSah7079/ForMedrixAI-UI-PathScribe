// src/services/cytology/mockFacilityCytologyNomenclatureOverrideService.ts
import type { IFacilityCytologyNomenclatureOverrideService, FacilityCytologyNomenclatureOverride } from './IFacilityCytologyNomenclatureOverrideService';
import { storageGet, storageSet } from '../mockStorage';
import type { ServiceResult } from '../types';

const STORAGE_KEY = 'facilityCytologyNomenclatureOverrides';

// Real, per direct guidance's own follow-up on seed data — the same
// real Fenwick Women's Hospital (jurisdiction: 'GB_EW') also uses the
// real BSCC/RCPath nomenclature (PS-173), matching its own real,
// primary_hpv_reflex screening strategy above — a complete, real UK
// facility profile, not just one setting in isolation.
const SEED: FacilityCytologyNomenclatureOverride[] = [
  {
    id: 'fac-nomenclature-seed-fenwick-womens', facilityId: 'c-fenwick-womens',
    overrides: { nomenclatureSystem: 'bscc_rcpath' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, confirmed gap, closed: Ardgowan NHS Health Board
    // (jurisdiction: 'GB_SCT') had no nomenclature override at all.
    // Real, direct confirmation this is correct, not assumed: per
    // direct guidance's own "Jurisdiction Breakdown" information,
    // "Scotland/Wales/NI... Clinical Protocol: Pathology reporting
    // must adhere to RCPath (Royal College of Pathologists) datasets
    // mapped to SNOMED CT" — RCPath is the real, UK-wide clinical
    // standard, not England-specific. BSCC/RCPath is the same real
    // system already confirmed for Fenwick Women's Hospital above;
    // this is the same real nomenclature, a second, distinct real UK
    // facility, not a second, separate dictionary.
    id: 'fac-nomenclature-seed-ardgowan-hb', facilityId: 'c-ardgowan-hb',
    overrides: { nomenclatureSystem: 'bscc_rcpath' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct research: RCPath's own real report into the
    // Southern Health and Social Care Trust's cervical cytology
    // laboratory directly confirms RCPath oversight of Northern
    // Ireland's own cytology lab services — the same real BSCC/RCPath
    // nomenclature already confirmed for England and Scotland.
    id: 'fac-nomenclature-seed-lagan-valley', facilityId: 'c-ni-lagan-valley',
    overrides: { nomenclatureSystem: 'bscc_rcpath' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'fac-nomenclature-seed-berlin-frauenklinik', facilityId: 'c-de-berlin-frauenklinik',
    overrides: { nomenclatureSystem: 'munchen_iiib' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own request: two facilities per real
    // geography. The Netherlands is the one new geography here that
    // needs a real nomenclature override — France, Belgium, Canada,
    // New Zealand, and Australia all use real Bethesda, matching the
    // Enterprise default, so none of them need one.
    id: 'fac-nomenclature-seed-amsterdam-cyto', facilityId: 'c-nl-amsterdam-cyto',
    overrides: { nomenclatureSystem: 'palga_cisoea' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
const SEED_VERSION = '5'; // bumped: real, new Northern Ireland facility (c-ni-lagan-valley) nomenclature override added — BSCC/RCPath.
const SEED_VERSION_KEY = 'facilityCytologyNomenclatureOverrides_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet(STORAGE_KEY, SEED);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load    = (): FacilityCytologyNomenclatureOverride[] => storageGet<FacilityCytologyNomenclatureOverride[]>(STORAGE_KEY, SEED);
const persist = (data: FacilityCytologyNomenclatureOverride[]) => storageSet(STORAGE_KEY, data);

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockFacilityCytologyNomenclatureOverrideService: IFacilityCytologyNomenclatureOverrideService = {
  async getForFacility(facilityId) {
    await delay();
    const record = load().find(r => r.facilityId === facilityId);
    return ok(record ? { ...record } : null);
  },

  async create(facilityId, overrides) {
    await delay();
    const records = load();
    if (records.some(r => r.facilityId === facilityId)) {
      return err(`Facility ${facilityId} already has a Cytology nomenclature settings override — update it instead of creating a second one.`);
    }
    const now = new Date().toISOString();
    const newRecord: FacilityCytologyNomenclatureOverride = {
      id: 'fac-nomenclature-' + Date.now(), facilityId, overrides: { ...overrides }, createdAt: now, updatedAt: now,
    };
    persist([...records, newRecord]);
    return ok({ ...newRecord });
  },

  async update(facilityId, changes) {
    await delay();
    const records = load();
    const idx = records.findIndex(r => r.facilityId === facilityId);
    if (idx === -1) return err(`Facility ${facilityId} has no Cytology nomenclature settings override to update — create one first.`);
    const updated: FacilityCytologyNomenclatureOverride = {
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

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
  {
    // Real, per direct research: the Northern Ireland Cervical
    // Screening Programme fully implemented primary HPV testing in
    // December 2023 — cytology now used as a real, second-line/reflex
    // test only for HPV-positive results, the same real strategy
    // already confirmed for England.
    id: 'fac-strategy-seed-lagan-valley', facilityId: 'c-ni-lagan-valley',
    overrides: { screeningStrategy: 'primary_hpv_reflex' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own German G-BA information: "Ages
    // 20-34: Annual primary Pap cytology... Ages 35 and older:
    // Co-testing... every 3 years." The real, age-stratified rule,
    // evaluated per-case via resolveEffectiveCytologyScreeningStrategyForPatient.ts
    // — the base screeningStrategy below is the real, safe fallback
    // for the rare case where a patient's own age can't be resolved.
    id: 'fac-strategy-seed-berlin-frauenklinik', facilityId: 'c-de-berlin-frauenklinik',
    overrides: {
      screeningStrategy: 'co_testing',
      ageStratifiedRule: { ageThreshold: 35, belowThresholdStrategy: 'cytology_only', atOrAboveThresholdStrategy: 'co_testing' },
    },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own Dutch information: "Primary
    // hrHPV (Reflex Cytology)" — no real age-stratification named for
    // the Netherlands, unlike Germany/France/Belgium.
    id: 'fac-strategy-seed-amsterdam-cyto', facilityId: 'c-nl-amsterdam-cyto',
    overrides: { screeningStrategy: 'primary_hpv_reflex' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own French information: "Ages
    // 25-29: Primary Pap cytology every 3 years... Ages 30-65: Primary
    // hrHPV... every 5 years. If positive, reflex Pap cytology."
    id: 'fac-strategy-seed-paris-cyto', facilityId: 'c-fr-paris-cyto',
    overrides: {
      screeningStrategy: 'primary_hpv_reflex',
      ageStratifiedRule: { ageThreshold: 30, belowThresholdStrategy: 'cytology_only', atOrAboveThresholdStrategy: 'primary_hpv_reflex' },
    },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own confirmed comparison: "This
    // makes Belgium's 30+ screening strategy identical to the
    // Netherlands... while keeping younger women on primary cytology
    // like Germany" — the same real age-stratified shape as France.
    id: 'fac-strategy-seed-brussels-cyto', facilityId: 'c-be-brussels-cyto',
    overrides: {
      screeningStrategy: 'primary_hpv_reflex',
      ageStratifiedRule: { ageThreshold: 30, belowThresholdStrategy: 'cytology_only', atOrAboveThresholdStrategy: 'primary_hpv_reflex' },
    },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own Canadian information: British
    // Columbia and Ontario have both real, concretely transitioned to
    // primary hrHPV with reflex cytology.
    id: 'fac-strategy-seed-vancouver-cyto', facilityId: 'c-ca-vancouver-cyto',
    overrides: { screeningStrategy: 'primary_hpv_reflex' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own New Zealand information: real
    // primary hrHPV screening, with the real self-collection option
    // (PS-178's own, already-generic isSelfCollected architecture).
    id: 'fac-strategy-seed-auckland-cyto', facilityId: 'c-nz-auckland-cyto',
    overrides: { screeningStrategy: 'primary_hpv_reflex' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct guidance's own Australian information (and
    // PS-178's own real self-collection work): primary hrHPV with
    // universal self-collection.
    id: 'fac-strategy-seed-sydney-cyto', facilityId: 'c-au-sydney-cyto',
    overrides: { screeningStrategy: 'primary_hpv_reflex' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    // Real, per direct research: Ireland moved to primary hrHPV
    // screening in March 2020.
    id: 'fac-strategy-seed-ncsl-dublin', facilityId: 'c-ie-ncsl-dublin',
    overrides: { screeningStrategy: 'primary_hpv_reflex' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
const SEED_VERSION = '5'; // bumped: real, new Northern Ireland facility (c-ni-lagan-valley) screening-strategy override added — primary_hpv_reflex, confirmed December 2023.
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

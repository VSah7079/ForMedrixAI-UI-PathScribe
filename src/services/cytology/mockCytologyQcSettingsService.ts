// src/services/cytology/mockCytologyQcSettingsService.ts
import { ICytologyQcSettingsService, CytologyQcSettingsConfig, DEFAULT_CYTOLOGY_QC_SETTINGS } from './ICytologyQcSettingsService';
import { storageGet, storageSet } from '../mockStorage';
import { ServiceResult } from '../types';

const STORAGE_KEY = 'cytologyQcSettings';

// Real, per direct correction's own structural shape change
// (randomSelectionRatePercent -> negativeRandomSelectionRatePercent +
// nonNegativeRandomSelectionRatePercent) — same real, established
// mock-data versioning pattern used elsewhere in this module after the
// earlier version-bump bug: anyone with pre-existing cached data on
// the old shape would silently carry a stale randomSelectionRatePercent
// field forever and get undefined for both new, real rate fields.
const SEED_VERSION = '2';
const SEED_VERSION_KEY = 'cytologyQcSettings_seed_version';
if (storageGet<string | null>(SEED_VERSION_KEY, null) !== SEED_VERSION) {
  storageSet(STORAGE_KEY, DEFAULT_CYTOLOGY_QC_SETTINGS);
  storageSet(SEED_VERSION_KEY, SEED_VERSION);
}

const load    = () => storageGet<CytologyQcSettingsConfig>(STORAGE_KEY, DEFAULT_CYTOLOGY_QC_SETTINGS);
const persist = (d: CytologyQcSettingsConfig) => storageSet(STORAGE_KEY, d);
let MOCK_CONFIG: CytologyQcSettingsConfig = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockCytologyQcSettingsService: ICytologyQcSettingsService = {
  async get() {
    await delay();
    return ok({ ...MOCK_CONFIG });
  },

  async update(patch) {
    await delay();
    MOCK_CONFIG = { ...MOCK_CONFIG, ...patch };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },

  async reset() {
    await delay();
    MOCK_CONFIG = { ...DEFAULT_CYTOLOGY_QC_SETTINGS };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },
};

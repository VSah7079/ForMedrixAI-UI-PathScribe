// src/services/cytology/mockCytologyWorkloadCapSettingsService.ts
import { ICytologyWorkloadCapSettingsService, CytologyWorkloadCapSettingsConfig, DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS } from './ICytologyWorkloadCapSettingsService';
import { storageGet, storageSet } from '../mockStorage';
import { ServiceResult } from '../types';

const STORAGE_KEY = 'cytologyWorkloadCapSettings';

const load    = () => storageGet<CytologyWorkloadCapSettingsConfig>(STORAGE_KEY, DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS);
const persist = (d: CytologyWorkloadCapSettingsConfig) => storageSet(STORAGE_KEY, d);
let MOCK_CONFIG: CytologyWorkloadCapSettingsConfig = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockCytologyWorkloadCapSettingsService: ICytologyWorkloadCapSettingsService = {
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
    MOCK_CONFIG = { ...DEFAULT_CYTOLOGY_WORKLOAD_CAP_SETTINGS };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },
};

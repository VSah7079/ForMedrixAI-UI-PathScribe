// src/services/cytology/mockCytologyRegistrySettingsService.ts
import { ICytologyRegistrySettingsService, CytologyRegistrySettingsConfig, DEFAULT_CYTOLOGY_REGISTRY_SETTINGS } from './ICytologyRegistrySettingsService';
import { storageGet, storageSet } from '../mockStorage';
import { ServiceResult } from '../types';

const STORAGE_KEY = 'cytologyRegistrySettings';

const load    = () => storageGet<CytologyRegistrySettingsConfig>(STORAGE_KEY, DEFAULT_CYTOLOGY_REGISTRY_SETTINGS);
const persist = (d: CytologyRegistrySettingsConfig) => storageSet(STORAGE_KEY, d);
let MOCK_CONFIG: CytologyRegistrySettingsConfig = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockCytologyRegistrySettingsService: ICytologyRegistrySettingsService = {
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
    MOCK_CONFIG = { ...DEFAULT_CYTOLOGY_REGISTRY_SETTINGS };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },
};

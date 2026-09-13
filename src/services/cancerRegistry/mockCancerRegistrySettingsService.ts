// src/services/cancerRegistry/mockCancerRegistrySettingsService.ts
import { ICancerRegistrySettingsService, CancerRegistrySettingsConfig, DEFAULT_CANCER_REGISTRY_SETTINGS } from './ICancerRegistrySettingsService';
import { storageGet, storageSet } from '../mockStorage';
import { ServiceResult } from '../types';

const STORAGE_KEY = 'cancerRegistrySettings';

const load = () => storageGet<CancerRegistrySettingsConfig>(STORAGE_KEY, DEFAULT_CANCER_REGISTRY_SETTINGS);
const persist = (d: CancerRegistrySettingsConfig) => storageSet(STORAGE_KEY, d);
let MOCK_CONFIG: CancerRegistrySettingsConfig = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockCancerRegistrySettingsService: ICancerRegistrySettingsService = {
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
    MOCK_CONFIG = { ...DEFAULT_CANCER_REGISTRY_SETTINGS };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },
};

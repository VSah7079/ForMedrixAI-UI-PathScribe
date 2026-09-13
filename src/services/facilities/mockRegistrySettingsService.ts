// src/services/facilities/mockRegistrySettingsService.ts
import { IRegistrySettingsService, RegistrySettingsConfig, DEFAULT_REGISTRY_SETTINGS } from './IRegistrySettingsService';
import { storageGet, storageSet } from '../mockStorage';
import { ServiceResult } from '../types';

const STORAGE_KEY = 'registrySettings';

const load    = () => storageGet<RegistrySettingsConfig>(STORAGE_KEY, DEFAULT_REGISTRY_SETTINGS);
const persist = (d: RegistrySettingsConfig) => storageSet(STORAGE_KEY, d);
let MOCK_CONFIG: RegistrySettingsConfig = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockRegistrySettingsService: IRegistrySettingsService = {
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
    MOCK_CONFIG = { ...DEFAULT_REGISTRY_SETTINGS };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },
};

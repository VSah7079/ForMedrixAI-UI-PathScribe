// src/services/cytology/mockCytologyInstrumentationService.ts
import { ICytologyInstrumentationService, CytologyInstrumentationConfig, DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG } from './ICytologyInstrumentationService';
import { storageGet, storageSet } from '../mockStorage';
import { ServiceResult } from '../types';

const STORAGE_KEY = 'cytologyInstrumentation';

const load = () => storageGet<CytologyInstrumentationConfig>(STORAGE_KEY, DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG);
const persist = (d: CytologyInstrumentationConfig) => storageSet(STORAGE_KEY, d);
let MOCK_CONFIG: CytologyInstrumentationConfig = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockCytologyInstrumentationService: ICytologyInstrumentationService = {
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
    MOCK_CONFIG = { ...DEFAULT_CYTOLOGY_INSTRUMENTATION_CONFIG };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },
};

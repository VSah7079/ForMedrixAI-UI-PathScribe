// src/services/cytology/mockCytologyScreeningStrategyService.ts
import { ICytologyScreeningStrategyService, CytologyScreeningStrategyConfig, DEFAULT_CYTOLOGY_SCREENING_STRATEGY } from './ICytologyScreeningStrategyService';
import { storageGet, storageSet } from '../mockStorage';
import { ServiceResult } from '../types';

const STORAGE_KEY = 'cytologyScreeningStrategy';

const load    = () => storageGet<CytologyScreeningStrategyConfig>(STORAGE_KEY, DEFAULT_CYTOLOGY_SCREENING_STRATEGY);
const persist = (d: CytologyScreeningStrategyConfig) => storageSet(STORAGE_KEY, d);
let MOCK_CONFIG: CytologyScreeningStrategyConfig = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const delay = () => new Promise(r => setTimeout(r, 60));

export const mockCytologyScreeningStrategyService: ICytologyScreeningStrategyService = {
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
    MOCK_CONFIG = { ...DEFAULT_CYTOLOGY_SCREENING_STRATEGY };
    persist(MOCK_CONFIG);
    return ok({ ...MOCK_CONFIG });
  },
};

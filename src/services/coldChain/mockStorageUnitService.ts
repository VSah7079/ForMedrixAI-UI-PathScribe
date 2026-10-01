// src/services/coldChain/mockStorageUnitService.ts
import type { IStorageUnitService, StorageUnit, NewStorageUnit } from './IStorageUnitService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'storageUnits';

const SEED: StorageUnit[] = [
  { id: 'su-freezer-01', name: 'Tissue Freezer 1 (-20°C)', storageConditionTypeId: 'sct-frozen-tissue', active: true, createdAt: new Date().toISOString() },
  { id: 'su-fridge-01', name: 'Specimen Refrigerator 1 (2-8°C)', storageConditionTypeId: 'sct-fresh-tissue', active: true, createdAt: new Date().toISOString() },
];

const load = (): StorageUnit[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: StorageUnit[]) => storageSet(STORAGE_KEY, data);
let _cache: StorageUnit[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockStorageUnitService: IStorageUnitService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getActive() {
    await delay();
    return ok(_cache.filter(u => u.active));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(u => u.id === id);
    return found ? ok({ ...found }) : err(`StorageUnit ${id} not found`);
  },

  async add(entry: NewStorageUnit) {
    await delay();
    const created: StorageUnit = { ...entry, id: 'su-custom-' + Date.now(), createdAt: new Date().toISOString() };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes) {
    await delay();
    const idx = _cache.findIndex(u => u.id === id);
    if (idx === -1) return err(`StorageUnit ${id} not found`);
    _cache = _cache.map(u => u.id === id ? { ...u, ...changes } : u);
    persist(_cache);
    return ok({ ..._cache.find(u => u.id === id)! });
  },

  async deactivate(id: ID) {
    return mockStorageUnitService.update(id, { active: false });
  },
};

// src/services/coldChain/mockStorageConditionTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IStorageConditionTypeService. Seed data is
// the RFP's own two named examples, verbatim — not invented
// placeholders.
// ─────────────────────────────────────────────────────────────────────────────

import type { IStorageConditionTypeService, StorageConditionType, NewStorageConditionType } from './IStorageConditionTypeService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'storageConditionTypes';

const SEED: StorageConditionType[] = [
  { id: 'sct-frozen-tissue', name: 'Frozen Tissue', maxTemperatureCelsius: -20, active: true, isSystem: true },
  { id: 'sct-fresh-tissue', name: 'Fresh Tissue', maxTemperatureCelsius: 8, active: true, isSystem: true },
];

const load = (): StorageConditionType[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: StorageConditionType[]) => storageSet(STORAGE_KEY, data);
let _cache: StorageConditionType[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockStorageConditionTypeService: IStorageConditionTypeService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getActive() {
    await delay();
    return ok(_cache.filter(e => e.active));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(e => e.id === id);
    return found ? ok({ ...found }) : err(`StorageConditionType ${id} not found`);
  },

  async add(entry: NewStorageConditionType) {
    await delay();
    const created: StorageConditionType = { ...entry, id: 'sct-custom-' + Date.now(), isSystem: false };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes) {
    await delay();
    const idx = _cache.findIndex(e => e.id === id);
    if (idx === -1) return err(`StorageConditionType ${id} not found`);
    _cache = _cache.map(e => e.id === id ? { ...e, ...changes } : e);
    persist(_cache);
    return ok({ ..._cache.find(e => e.id === id)! });
  },

  async deactivate(id: ID) {
    return mockStorageConditionTypeService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockStorageConditionTypeService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(e => e.id === id);
    if (!target) return err(`StorageConditionType ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system storage condition type "${id}"`);
    _cache = _cache.filter(e => e.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

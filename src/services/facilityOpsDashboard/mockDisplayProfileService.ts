// src/services/facilityOpsDashboard/mockDisplayProfileService.ts
// Same real CRUD/seed/storage pattern as mockOrSuiteTerminalService.ts.
import type { IDisplayProfileService, DisplayProfile, NewDisplayProfile } from './IDisplayProfileService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'displayProfiles';

// One real, seeded profile so the kiosk binding screen and the admin
// registry both have something real to show out of the box — same
// real reasoning as OrSuiteTerminal's own single seed row, and the
// same real Fenwick General facility id every other seed in this app
// resolves against.
const SEED_PROFILES: DisplayProfile[] = [
  {
    id: 'dispprof-seed-histology',
    name: 'Histology Lab — Main Wall Display',
    facilityId: 'c-fenwick-general',
    assignedViews: ['grossing_intake', 'embedding_microtomy', 'staining_ihc'],
    carouselIntervalSeconds: 20,
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const load = (): DisplayProfile[] => storageGet(STORAGE_KEY, SEED_PROFILES);
const persist = (data: DisplayProfile[]) => storageSet(STORAGE_KEY, data);
let _cache: DisplayProfile[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockDisplayProfileService: IDisplayProfileService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getActive() {
    await delay();
    return ok(_cache.filter(p => p.status === 'Active'));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(p => p.id === id);
    return found ? ok({ ...found }) : err(`DisplayProfile ${id} not found`);
  },

  async add(entry: NewDisplayProfile) {
    await delay();
    if (_cache.some(p => p.name.trim().toUpperCase() === entry.name.trim().toUpperCase())) {
      return err(`A display profile named "${entry.name}" already exists.`);
    }
    if (entry.assignedViews.length === 0) return err('At least one dashboard view must be assigned.');
    const created: DisplayProfile = { ...entry, id: 'dispprof-' + Date.now(), createdAt: new Date().toISOString() };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes) {
    await delay();
    const idx = _cache.findIndex(p => p.id === id);
    if (idx === -1) return err(`DisplayProfile ${id} not found`);
    if (changes.assignedViews && changes.assignedViews.length === 0) return err('At least one dashboard view must be assigned.');
    _cache = _cache.map(p => p.id === id ? { ...p, ...changes } : p);
    persist(_cache);
    return ok({ ..._cache.find(p => p.id === id)! });
  },

  async deactivate(id: ID) {
    return mockDisplayProfileService.update(id, { status: 'Inactive' });
  },
};

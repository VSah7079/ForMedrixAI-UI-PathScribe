// src/services/intraopDashboard/mockOrSuiteTerminalService.ts
import type { IOrSuiteTerminalService, OrSuiteTerminal, NewOrSuiteTerminal } from './IOrSuiteTerminalService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'orSuiteTerminals';

// Real, per direct follow-up: "shouldn't we have seed data?" — this
// was the real, documented reason DemoResetTab.tsx's own audit
// deliberately left orSuiteTerminals out of the reset (no fallback
// meant clearing it broke the OR Suite Live Board, rather than
// restoring it). One real, existing OR-type Location already exists
// in this app's own seed data (services/locations/
// mockLocationService.ts) — 'loc-fgh-theatre-2' ("Theatre 2",
// Fenwick General) — reused directly here rather than inventing a
// second, orphaned location id nothing else in the app would resolve.
const SEED_TERMINALS: OrSuiteTerminal[] = [
  {
    id: 'orterm-seed-theatre2',
    name: 'OR-Suite-Theatre2',
    locationId: 'loc-fgh-theatre-2',
    facilityId: 'c-fenwick-general',
    canViewMultiSuite: true,
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const load = (): OrSuiteTerminal[] => storageGet(STORAGE_KEY, SEED_TERMINALS);
const persist = (data: OrSuiteTerminal[]) => storageSet(STORAGE_KEY, data);
let _cache: OrSuiteTerminal[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

export const mockOrSuiteTerminalService: IOrSuiteTerminalService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getActive() {
    await delay();
    return ok(_cache.filter(t => t.status === 'Active'));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(t => t.id === id);
    return found ? ok({ ...found }) : err(`OrSuiteTerminal ${id} not found`);
  },

  async add(entry: NewOrSuiteTerminal) {
    await delay();
    if (_cache.some(t => t.name.toUpperCase() === entry.name.trim().toUpperCase())) {
      return err(`A terminal named "${entry.name}" is already registered.`);
    }
    const created: OrSuiteTerminal = { ...entry, id: 'orterm-' + Date.now(), createdAt: new Date().toISOString() };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes) {
    await delay();
    const idx = _cache.findIndex(t => t.id === id);
    if (idx === -1) return err(`OrSuiteTerminal ${id} not found`);
    _cache = _cache.map(t => t.id === id ? { ...t, ...changes } : t);
    persist(_cache);
    return ok({ ..._cache.find(t => t.id === id)! });
  },

  async deactivate(id: ID) {
    return mockOrSuiteTerminalService.update(id, { status: 'Inactive' });
  },
};

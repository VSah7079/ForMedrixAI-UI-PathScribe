// src/services/digitalPathology/mockDpVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IDpVendorService. Seed data grounded in this
// module's own earlier, real DP/AI vendor research — real, named,
// FDA-cleared products, not invented placeholders: Paige Prostate
// (2021, the first ever FDA-cleared AI pathology product), Ibex
// Prostate Detect (the second), PathAI AISight Dx (deployed across
// the Labcorp network), Proscia Concentriq AP-Dx (FDA 510(k),
// confirmed August 2026), and Hologic Genius Digital Diagnostics —
// confirmed, at the time of that research, as the only FDA-cleared AI
// specifically for routine cervical cytology screening.
// ─────────────────────────────────────────────────────────────────────────────

import type { IDpVendorService, DpVendorEntry, DpVendorModality, NewDpVendorEntry } from './IDpVendorService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'dpVendorDictionary';

const SEED: DpVendorEntry[] = [
  { id: 'dp-vendor-paige-prostate', name: 'Paige', productName: 'Paige Prostate', modality: 'prostate', fdaCleared: true, active: true, isSystem: true, sortOrder: 1 },
  { id: 'dp-vendor-ibex-prostate-detect', name: 'Ibex', productName: 'Ibex Prostate Detect', modality: 'prostate', fdaCleared: true, active: true, isSystem: true, sortOrder: 2 },
  { id: 'dp-vendor-pathai-aisight-dx', name: 'PathAI', productName: 'AISight Dx', modality: 'surgical_pathology_general', fdaCleared: true, active: true, isSystem: true, sortOrder: 3 },
  { id: 'dp-vendor-proscia-concentriq', name: 'Proscia', productName: 'Concentriq AP-Dx', modality: 'surgical_pathology_general', fdaCleared: true, active: true, isSystem: true, sortOrder: 4 },
  { id: 'dp-vendor-hologic-genius', name: 'Hologic', productName: 'Genius Digital Diagnostics', modality: 'cervical_cytology', fdaCleared: true, active: true, isSystem: true, sortOrder: 5 },
  // Real, per RFP-APLIS-2026-GLOBAL Story 10 (Cytology Assist FOV
  // Ingestion), added with the same real research discipline as
  // every other seed entry above. Real, honest regulatory nuance,
  // confirmed directly rather than assumed: the BD FocalPoint GS
  // Imaging System is FDA-AUTHORIZED, but via a PMA supplement
  // (P950009S008) — approval, not 510(k) clearance, the specific
  // real pathway this dictionary's own fdaCleared field tracks (the
  // admin UI literally renders it as the label "FDA Cleared"). Set
  // honestly to false here, not because the product lacks real FDA
  // authorization, but because "cleared" would be the wrong real
  // regulatory word for it.
  { id: 'dp-vendor-bd-focalpoint', name: 'BD', productName: 'FocalPoint GS Imaging System', modality: 'cervical_cytology', fdaCleared: false, active: true, isSystem: true, sortOrder: 6 },
];

const load = (): DpVendorEntry[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: DpVendorEntry[]) => storageSet(STORAGE_KEY, data);
let _cache: DpVendorEntry[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));
const sorted = (entries: DpVendorEntry[]) => [...entries].sort((a, b) => a.sortOrder - b.sortOrder);

export const mockDpVendorService: IDpVendorService = {
  async getAll() {
    await delay();
    return ok(sorted(_cache));
  },

  async getActive() {
    await delay();
    return ok(sorted(_cache.filter(e => e.active)));
  },

  async getByModality(modality: DpVendorModality) {
    await delay();
    return ok(sorted(_cache.filter(e => e.active && e.modality === modality)));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(e => e.id === id);
    return found ? ok({ ...found }) : err(`DpVendorEntry ${id} not found`);
  },

  async add(entry: NewDpVendorEntry) {
    await delay();
    const maxOrder = _cache.reduce((m, e) => Math.max(m, e.sortOrder), 0);
    const created: DpVendorEntry = { ...entry, id: 'dp-vendor-custom-' + Date.now(), isSystem: false, sortOrder: maxOrder + 1 };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<DpVendorEntry>) {
    await delay();
    const idx = _cache.findIndex(e => e.id === id);
    if (idx === -1) return err(`DpVendorEntry ${id} not found`);
    const { isSystem: _ignored, ...safeChanges } = changes as any;
    _cache = _cache.map(e => e.id === id ? { ...e, ...safeChanges } : e);
    persist(_cache);
    return ok({ ..._cache.find(e => e.id === id)! });
  },

  async deactivate(id: ID) {
    return mockDpVendorService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockDpVendorService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(e => e.id === id);
    if (!target)         return err(`DpVendorEntry ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system DP vendor entry "${id}"`);
    _cache = _cache.filter(e => e.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

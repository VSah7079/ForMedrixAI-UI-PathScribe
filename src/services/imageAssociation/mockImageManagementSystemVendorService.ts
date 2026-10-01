// src/services/imageAssociation/mockImageManagementSystemVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IImageManagementSystemVendorService. Real,
// honest seed data: unlike the WSI viewer vendors (where the RFP
// itself names real companies), no specific real VNA/PACS/DAM vendor
// is named anywhere in the uploaded spec or researched for this pass
// — seeded with clearly-generic, unconfigured placeholders rather
// than guessing a real company name without research, plus one
// `[DEMO ONLY]` entry with a real, working synthetic base URL, same
// "for demo, why not synthetic" reasoning already established for
// the SNOMED severity mapping and WSI viewer dictionaries.
// ─────────────────────────────────────────────────────────────────────────────

import type { IImageManagementSystemVendorService, ImageManagementSystemVendorEntry, NewImageManagementSystemVendorEntry } from './IImageManagementSystemVendorService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'imageManagementSystemVendorDictionary';

const SEED: ImageManagementSystemVendorEntry[] = [
  { id: 'ims-enterprise-default', name: 'Enterprise VNA / PACS / DAM (not yet configured)', deploymentModel: 'enterprise_ims', authMethod: 'oauth2_bearer', baseUrl: '', active: true, isSystem: true, sortOrder: 1 },
  { id: 'ims-onprem-default', name: 'On-Prem File Server (not yet configured)', deploymentModel: 'on_prem_file_server', authMethod: 'none', baseUrl: '', active: true, isSystem: true, sortOrder: 2 },
  { id: 'ims-demo', name: '[DEMO ONLY] Sample Image Server', deploymentModel: 'enterprise_ims', authMethod: 'none', baseUrl: 'https://example.com/demo-image-server', active: true, isSystem: true, sortOrder: 3 },
];

const load = (): ImageManagementSystemVendorEntry[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: ImageManagementSystemVendorEntry[]) => storageSet(STORAGE_KEY, data);
let _cache: ImageManagementSystemVendorEntry[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));
const sorted = (entries: ImageManagementSystemVendorEntry[]) => [...entries].sort((a, b) => a.sortOrder - b.sortOrder);

export const mockImageManagementSystemVendorService: IImageManagementSystemVendorService = {
  async getAll() {
    await delay();
    return ok(sorted(_cache));
  },

  async getActive() {
    await delay();
    return ok(sorted(_cache.filter(e => e.active)));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(e => e.id === id);
    return found ? ok({ ...found }) : err(`ImageManagementSystemVendorEntry ${id} not found`);
  },

  async add(entry: NewImageManagementSystemVendorEntry) {
    await delay();
    const maxOrder = _cache.reduce((m, e) => Math.max(m, e.sortOrder), 0);
    const created: ImageManagementSystemVendorEntry = { ...entry, id: 'ims-custom-' + Date.now(), isSystem: false, sortOrder: maxOrder + 1 };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<ImageManagementSystemVendorEntry>) {
    await delay();
    const idx = _cache.findIndex(e => e.id === id);
    if (idx === -1) return err(`ImageManagementSystemVendorEntry ${id} not found`);
    const { isSystem: _ignored, ...safeChanges } = changes as any;
    _cache = _cache.map(e => e.id === id ? { ...e, ...safeChanges } : e);
    persist(_cache);
    return ok({ ..._cache.find(e => e.id === id)! });
  },

  async deactivate(id: ID) {
    return mockImageManagementSystemVendorService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockImageManagementSystemVendorService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(e => e.id === id);
    if (!target)         return err(`ImageManagementSystemVendorEntry ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system Image Management System vendor entry "${id}"`);
    _cache = _cache.filter(e => e.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

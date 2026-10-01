// src/services/imageAssociation/mockGrossImagingVendorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation of IGrossImagingVendorService. Seed data: the
// three real vendors provided via direct research — real company
// names, real headquarters, real capability descriptions — kept
// exact rather than paraphrased or invented, same standard as every
// other real, named vendor seeded elsewhere in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { IGrossImagingVendorService, GrossImagingVendorEntry, NewGrossImagingVendorEntry } from './IGrossImagingVendorService';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'grossImagingVendorDictionary';

const SEED: GrossImagingVendorEntry[] = [
  // Real, per direct research: MIS Incorporated, Villa Park, Illinois
  // — gross imaging, frozen sections, camera-mounted microscopes,
  // tumor boards; direct case-folder integration from grossing
  // stations; live telepathology streaming.
  { id: 'gross-imaging-paxit', name: 'PAX-it! / PAXcam (MIS Incorporated)', authMethod: 'none', baseUrl: '', supportsTelepathology: true, active: true, isSystem: true, sortOrder: 1 },
  // Real, per direct research: Smart In Media, Cologne, Germany —
  // widespread UK NHS trust and European private pathology network
  // deployment; PathoZoom® Grossing and Digital Lab, LIS-agnostic via
  // APIs/DICOM/HL7; secure telepathology and live-streaming modules.
  { id: 'gross-imaging-pathozoom', name: 'Smart In Media — PathoZoom®', authMethod: 'oauth2_bearer', baseUrl: '', supportsTelepathology: true, active: true, isSystem: true, sortOrder: 2 },
  // Real, per direct research: Milestone Medical — UK-focused gross
  // specimen camera hardware and macro image documentation software;
  // static capture/annotation, no telepathology streaming confirmed.
  { id: 'gross-imaging-macropath', name: 'Milestone Medical — MacroPATH', authMethod: 'none', baseUrl: '', supportsTelepathology: false, active: true, isSystem: true, sortOrder: 3 },
  // Real, per this app's own established "for demo, why not
  // synthetic" reasoning (SNOMED, WSI viewer, Image Management
  // dictionaries).
  { id: 'gross-imaging-demo', name: '[DEMO ONLY] Sample Gross Imaging System', authMethod: 'none', baseUrl: 'https://example.com/demo-gross-imaging', supportsTelepathology: true, active: true, isSystem: true, sortOrder: 4 },
];

const load = (): GrossImagingVendorEntry[] => storageGet(STORAGE_KEY, SEED);
const persist = (data: GrossImagingVendorEntry[]) => storageSet(STORAGE_KEY, data);
let _cache: GrossImagingVendorEntry[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));
const sorted = (entries: GrossImagingVendorEntry[]) => [...entries].sort((a, b) => a.sortOrder - b.sortOrder);

export const mockGrossImagingVendorService: IGrossImagingVendorService = {
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
    return found ? ok({ ...found }) : err(`GrossImagingVendorEntry ${id} not found`);
  },

  async add(entry: NewGrossImagingVendorEntry) {
    await delay();
    const maxOrder = _cache.reduce((m, e) => Math.max(m, e.sortOrder), 0);
    const created: GrossImagingVendorEntry = { ...entry, id: 'gross-imaging-custom-' + Date.now(), isSystem: false, sortOrder: maxOrder + 1 };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async update(id: ID, changes: Partial<GrossImagingVendorEntry>) {
    await delay();
    const idx = _cache.findIndex(e => e.id === id);
    if (idx === -1) return err(`GrossImagingVendorEntry ${id} not found`);
    const { isSystem: _ignored, ...safeChanges } = changes as any;
    _cache = _cache.map(e => e.id === id ? { ...e, ...safeChanges } : e);
    persist(_cache);
    return ok({ ..._cache.find(e => e.id === id)! });
  },

  async deactivate(id: ID) {
    return mockGrossImagingVendorService.update(id, { active: false });
  },

  async reactivate(id: ID) {
    return mockGrossImagingVendorService.update(id, { active: true });
  },

  async remove(id: ID) {
    await delay();
    const target = _cache.find(e => e.id === id);
    if (!target)         return err(`GrossImagingVendorEntry ${id} not found`);
    if (target.isSystem) return err(`Cannot delete system Gross Imaging vendor entry "${id}"`);
    _cache = _cache.filter(e => e.id !== id);
    persist(_cache);
    return ok(undefined);
  },
};

// src/services/assetLocation/mockAssetLocationDictionaryService.ts
import type { IAssetLocationDictionaryService } from './IAssetLocationDictionaryService';
import type { AssetLocationEntry } from '@/types/assetLocation/AssetLocationEntry';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

// ─── Seed data ──────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed dictionary — seeded with
// the exact same example location strings types/case/Material.ts's
// own MaterialLocation.location doc comment already references
// ("Grossing Station 3", "Archive Shelf 12B") rather than fabricating
// new ones, plus one deliberately Unverified/autoCreated example so
// the admin approval screen has something real to show before any
// live material-location event has actually arrived — same reasoning
// as mockDepartmentService.ts's own "Frozen Section" seed entry.
const SEED_ASSET_LOCATIONS: AssetLocationEntry[] = [
  {
    id: 'loc-grossing-station-3',
    name: 'Grossing Station 3',
    locationType: 'workstation',
    normalizedLabel: 'grossing station 3',
    synonyms: [],
    status: 'Active',
    version: 1,
    updatedBy: 'system',
    updatedAt: '2026-01-01',
  },
  {
    id: 'loc-archive-shelf-12b',
    name: 'Archive Shelf 12B',
    locationType: 'archive_shelf',
    normalizedLabel: 'archive shelf 12b',
    synonyms: [],
    status: 'Active',
    version: 1,
    updatedBy: 'system',
    updatedAt: '2026-01-01',
  },
  // Deliberately Unverified/autoCreated — gives the admin approval
  // screen (once built) something real to display before any live
  // material-location event has actually reported an unmatched
  // location, same reasoning as mockDepartmentService.ts's own
  // "Frozen Section" seed entry.
  {
    id: 'loc-auto-000001',
    name: 'Histology Bench 2',
    locationType: 'workstation',
    normalizedLabel: 'histology bench 2',
    synonyms: [],
    status: 'Unverified',
    autoCreated: true,
    autoCreatedAt: '2026-08-01',
    autoCreatedNote: 'No exact match for location "Histology Bench 2" reported by source system LIS_LEGACY_A on case S26-1003 — created pending admin review.',
    version: 1,
    updatedBy: 'system',
    updatedAt: '2026-08-01',
  },
];

const load    = () => storageGet<AssetLocationEntry[]>('pathscribe_asset_locations', SEED_ASSET_LOCATIONS);
const persist = (data: AssetLocationEntry[]) => storageSet('pathscribe_asset_locations', data);
let ASSET_LOCATIONS: AssetLocationEntry[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockAssetLocationDictionaryService: IAssetLocationDictionaryService = {
  async getAll() {
    await delay();
    return ok([...ASSET_LOCATIONS]);
  },

  async getById(id: ID) {
    await delay();
    const l = ASSET_LOCATIONS.find(l => l.id === id);
    return l ? ok({ ...l }) : err(`Asset location ${id} not found`);
  },

  async add(entry) {
    await delay();
    const newL: AssetLocationEntry = { ...entry, id: 'loc-' + Date.now() };
    ASSET_LOCATIONS = [...ASSET_LOCATIONS, newL];
    persist(ASSET_LOCATIONS);
    return ok({ ...newL });
  },

  async update(id, changes) {
    await delay();
    const idx = ASSET_LOCATIONS.findIndex(l => l.id === id);
    if (idx === -1) return err(`Asset location ${id} not found`);
    ASSET_LOCATIONS = ASSET_LOCATIONS.map(l => l.id === id ? { ...l, ...changes } : l);
    persist(ASSET_LOCATIONS);
    return ok({ ...ASSET_LOCATIONS[idx], ...changes });
  },

  async verify(id) {
    return mockAssetLocationDictionaryService.update(id, { status: 'Active' });
  },

  async deactivate(id) {
    return mockAssetLocationDictionaryService.update(id, { status: 'Inactive' });
  },

  async findOrCreateByName(name, note) {
    await delay();
    // Case-insensitive exact match only — same "don't fuzzy-match
    // silently" posture as mockDepartmentService.ts's own identical
    // reasoning: a real near-miss creates a new, real pending entry
    // for a human to reconcile, never gets quietly folded into a
    // possibly-different real physical location.
    const existing = ASSET_LOCATIONS.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existing) return ok({ ...existing });

    const newL: AssetLocationEntry = {
      id: 'loc-auto-' + Date.now(),
      name,
      locationType: 'other',
      normalizedLabel: name.toLowerCase(),
      synonyms: [],
      status: 'Unverified',
      autoCreated: true,
      autoCreatedAt: new Date().toISOString().split('T')[0],
      autoCreatedNote: note,
      version: 1,
      updatedBy: 'system',
      updatedAt: new Date().toISOString().split('T')[0],
    };
    ASSET_LOCATIONS = [...ASSET_LOCATIONS, newL];
    persist(ASSET_LOCATIONS);
    return ok({ ...newL });
  },
};

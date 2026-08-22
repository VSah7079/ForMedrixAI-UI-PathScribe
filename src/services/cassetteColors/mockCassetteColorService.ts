// src/services/cassetteColors/mockCassetteColorService.ts
// ─────────────────────────────────────────────────────────────────────────────
// See ICassetteColorService.ts's own header for the full rationale.
// White is seeded with no fallback at all — a real, deliberate anchor:
// if White itself is ever reported unavailable, auto-substituting
// something else silently could mask a genuinely broken hopper setup;
// this dictionary's own fallbackBehavior is 'prompt' for White
// specifically, so that case always surfaces to a technician rather
// than chaining through colors indefinitely.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { CassetteColorDefinition, ICassetteColorService } from './ICassetteColorService';

const SEED_COLORS: CassetteColorDefinition[] = [
  {
    id: 'color-white', key: 'COLOR_WHITE', displayName: 'White', hexCode: '#F8FAFC', active: true,
    fallbackBehavior: 'prompt',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'color-blue', key: 'COLOR_BIOPSY', displayName: 'Blue', hexCode: '#3B82F6', active: true,
    fallbackBehavior: 'auto', fallbackColorId: 'color-white',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'color-red', key: 'COLOR_STAT', displayName: 'Red', hexCode: '#EF4444', active: true,
    // Real, deliberate choice: a STAT case should never silently
    // fall back to a color that no longer visually signals "urgent"
    // on the bench — 'prompt' here, not 'auto', so a tech is always
    // in the loop for this specific color.
    fallbackBehavior: 'prompt',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'color-pink', key: 'COLOR_RUSH', displayName: 'Pink', hexCode: '#EC4899', active: true,
    fallbackBehavior: 'auto', fallbackColorId: 'color-white',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  },
  // Real feature, per direct follow-up: cell blocks "frequently use
  // distinct cassette colors... to signal fragile cytopreparations to
  // histotechnologists," specifically "specialized dual-mesh
  // cassettes." Real, deliberate 'prompt' fallback, not 'auto', same
  // reasoning as color-red above: a fragile cell block silently
  // auto-substituted into a non-mesh cassette risks real, physical
  // material loss during processing, not just a lost visual signal —
  // a technician should always be in the loop for this one.
  {
    id: 'color-green-mesh', key: 'COLOR_CELLBLOCK', displayName: 'Green / Mesh', hexCode: '#22C55E', active: true,
    fallbackBehavior: 'prompt',
    createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
  },
  // Real feature, per direct follow-up: "the Pink/Rush color conflict
  // is still unresolved... if you want a dedicated 'small biopsy'
  // color as originally described, it needs its own, different
  // color." color-pink/COLOR_RUSH already exists (seeded above) but
  // has zero real routing rules using it — confirmed directly before
  // adding this — so there was never a genuine, live conflict, only a
  // naming trap: pointing a new small-biopsy rule at that same,
  // Rush-named record would read as "Rush" on the Cassette Colors
  // admin screen while actually meaning something else. This is a
  // real, separate, honestly-named color instead — see the new
  // 'Small Biopsy — Yellow' routing rules (mockCassetteRoutingRuleService.ts)
  // that actually use it.
  {
    id: 'color-yellow', key: 'COLOR_SMALL_BIOPSY', displayName: 'Yellow', hexCode: '#FACC15', active: true,
    fallbackBehavior: 'auto', fallbackColorId: 'color-white',
    createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z',
  },
];

const STORAGE_KEY = 'cassette_colors';

function load(): CassetteColorDefinition[] {
  return storageGet<CassetteColorDefinition[]>(STORAGE_KEY, SEED_COLORS);
}

function save(colors: CassetteColorDefinition[]): void {
  storageSet(STORAGE_KEY, colors);
}

export const mockCassetteColorService: ICassetteColorService = {
  async getAll(): Promise<ServiceResult<CassetteColorDefinition[]>> {
    return { ok: true, data: load() };
  },

  async getById(id: ID): Promise<ServiceResult<CassetteColorDefinition>> {
    const found = load().find(c => c.id === id);
    if (!found) return { ok: false, error: `No cassette color found for id '${id}'.` };
    return { ok: true, data: found };
  },

  async getByKey(key: string): Promise<ServiceResult<CassetteColorDefinition>> {
    const found = load().find(c => c.key.toLowerCase() === key.toLowerCase());
    if (!found) return { ok: false, error: `No cassette color found for key '${key}'.` };
    return { ok: true, data: found };
  },

  async create(draft): Promise<ServiceResult<CassetteColorDefinition>> {
    const all = load();
    const now = new Date().toISOString();
    const created: CassetteColorDefinition = { ...draft, id: `color-${Date.now()}`, createdAt: now, updatedAt: now };
    save([...all, created]);
    return { ok: true, data: created };
  },

  async update(id: ID, changes): Promise<ServiceResult<CassetteColorDefinition>> {
    const all = load();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return { ok: false, error: `No cassette color found for id '${id}'.` };
    const updated: CassetteColorDefinition = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    save(next);
    return { ok: true, data: updated };
  },

  async deactivate(id: ID): Promise<ServiceResult<CassetteColorDefinition>> {
    return mockCassetteColorService.update(id, { active: false });
  },

  async reactivate(id: ID): Promise<ServiceResult<CassetteColorDefinition>> {
    return mockCassetteColorService.update(id, { active: true });
  },
};

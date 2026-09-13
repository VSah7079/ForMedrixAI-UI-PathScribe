// src/services/assetLocation/IAssetLocationDictionaryService.ts
// ─────────────────────────────────────────────────────────────
// Asset Location Dictionary — the real, governed reference list for
// physical/asset locations (mortuary storage, workstations, archive
// shelves), per direct guidance's own confirmed concern about
// MaterialLocation.location's own free-text drift risk.
//
// Follows IDepartmentService's/IPhysicianService's exact governance
// shape — status/autoCreated/findOrCreateByName — rather than
// inventing a new pattern. Same real reason those already work this
// way: an unrecognized incoming location shouldn't block a real
// material-location event from being applied, it should create a
// real, Unverified, autoCreated entry so an admin can reconcile it
// later — see processMaterialLocationEvent.ts's own updated header
// comment for exactly where this gets called from.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { AssetLocationEntry } from '@/types/assetLocation/AssetLocationEntry';

export interface IAssetLocationDictionaryService {
  getAll(): Promise<ServiceResult<AssetLocationEntry[]>>;
  getById(id: ID): Promise<ServiceResult<AssetLocationEntry | undefined>>;
  add(entry: Omit<AssetLocationEntry, 'id'>): Promise<ServiceResult<AssetLocationEntry>>;
  update(id: ID, changes: Partial<Omit<AssetLocationEntry, 'id'>>): Promise<ServiceResult<AssetLocationEntry>>;
  verify(id: ID): Promise<ServiceResult<AssetLocationEntry>>;
  deactivate(id: ID): Promise<ServiceResult<AssetLocationEntry>>;

  /**
   * Called from processMaterialLocationEvent.ts (and, in future, any
   * other real ingestion path that reports a free-text location).
   * Case-insensitive EXACT match only against `name` — deliberately
   * never fuzzy — a real near-miss creates a new, real Unverified
   * entry for a human to reconcile (e.g. merge with an existing one),
   * mirroring findOrCreateByName's own exact real reasoning in
   * mockDepartmentService.ts: silently folding a near-miss into an
   * existing entry risks conflating two genuinely different real
   * locations. No exact match → creates an Unverified, autoCreated
   * entry immediately so the real, calling event is never blocked.
   */
  findOrCreateByName(name: string, note?: string): Promise<ServiceResult<AssetLocationEntry>>;
}

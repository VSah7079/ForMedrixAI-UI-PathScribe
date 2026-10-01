// src/types/assetLocation/AssetLocationEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed concern: MaterialLocation.
// location (types/case/Material.ts) is deliberately free text — sound
// for its own real reason (external LIS systems' own location
// vocabulary varies too much for a closed enum to ever be right for
// most real deployments) — but that same flexibility is a real typo/
// drift risk with no visibility into it. This dictionary is the real,
// governed reference list that risk needs, following the exact same
// real pattern already proven for Department/Physician (status/
// autoCreated/findOrCreateByName) — see services/assetLocation/
// IAssetLocationDictionaryService.ts's own header comment for the
// full, real precedent this mirrors.
//
// Real, deliberate scope: this dictionary is a real, governed
// REFERENCE list — it never replaces MaterialLocation.location's own
// free-text storage, and never blocks a real material-location event
// from being applied. See processMaterialLocationEvent.ts's own
// updated header comment for how the two now work together.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per direct guidance's own confirmed mortuary/asset-tracking
 *  need — kept broad enough to cover both the new mortuary storage
 *  registry (building/room/storage_unit/storage_slot) and existing
 *  real location kinds already reported today (workstation,
 *  archive_shelf) — a closed set, since a location's own TYPE (not
 *  its specific identity) is a real, small, stable vocabulary, unlike
 *  the location name itself. */
export type AssetLocationType =
  | 'building'
  | 'room'
  | 'storage_unit'
  | 'storage_slot'
  | 'workstation'
  | 'archive_shelf'
  | 'other';

export interface AssetLocationEntry {
  id: string;
  name: string;
  locationType: AssetLocationType;
  /** Real, for a real physical hierarchy (e.g. a storage_slot's own
   *  parent is the storage_unit it sits in) — references another real
   *  AssetLocationEntry.id. Undefined for a real top-level location
   *  with no real parent (e.g. a building). */
  parentLocationId?: string;
  description?: string;
  normalizedLabel: string;
  synonyms: string[];
  /** Real, per direct guidance's own confirmed governance pattern —
   *  mirrors Department.status/Physician's own exact shape. */
  status: 'Active' | 'Inactive' | 'Unverified';
  autoCreated?: boolean;
  autoCreatedAt?: string;
  /** Real, per direct guidance's own "could the engine... create a
   *  build event" question — this is that record: which real,
   *  incoming event (case, source system) caused this entry to be
   *  auto-created, so a real admin reconciling it later has the real
   *  context, not just an unexplained new entry. */
  autoCreatedNote?: string;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

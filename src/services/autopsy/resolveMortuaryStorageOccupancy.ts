// src/services/autopsy/resolveMortuaryStorageOccupancy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed correction: "the body is
// usually the specimen, and we track specimen level" — a real body IS
// a real Specimen (Case.specimens[]), exactly like every other real
// specialty already models it, and its own real location tracking is
// already fully built: Specimen.locationHistory: MaterialLocation[]
// (types/case/Material.ts), fed by the exact same real
// processMaterialLocationEvent.ts pipeline this session already wired
// the Asset Location Dictionary into. This file's own earlier version
// invented a genuinely separate, parallel AutopsyStorageAssignment
// type/log to solve a problem that infrastructure had already solved
// — real, honest duplication, now removed.
//
// Real, per direct guidance's own confirmed RFP requirement
// ("Real-time mortuary tray utilization... available storage
// slots"). A real 'storage_slot' AssetLocationEntry is occupied when
// it's the real, CURRENT (most recent, by `at`) location of some real
// specimen's own locationHistory — MaterialLocation has no explicit
// "released" flag at all, so a specimen simply moving on to a new
// real location is what frees the old one, never a second, separate
// release event to track.
//
// Real, deliberate scope: matches by real, case-insensitive NAME —
// MaterialLocation.location is deliberately free text (see that
// field's own doc comment), never a stored AssetLocationEntry.id
// reference, so a real name match against the dictionary's own real
// `name` field is the only real way to connect the two, the same
// real matching resolveAssetLocationDictionaryService.findOrCreateByName
// already uses.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetLocationEntry } from '@/types/assetLocation/AssetLocationEntry';
import type { MaterialLocation } from '@/types/case/Material';

export interface MortuaryStorageOccupancyEntry {
  location: AssetLocationEntry;
  occupied: boolean;
}

/** Real, per direct guidance's own confirmed design. Returns the
 *  real, most recent (by `at`) entry in a real specimen's own
 *  location history — undefined for a real specimen with no real
 *  location events logged yet. */
function resolveMostRecentLocation(history: MaterialLocation[]): MaterialLocation | undefined {
  if (history.length === 0) return undefined;
  return history.reduce((latest, entry) => (new Date(entry.at) > new Date(latest.at) ? entry : latest));
}

/** Real, per direct guidance's own confirmed design. Only ever
 *  reports on real 'storage_slot' locations — a real 'storage_unit'
 *  (e.g. a whole freezer housing many real slots) is never itself
 *  something a real specimen directly occupies. `specimenLocationHistories`
 *  is a real, already-gathered list of each real, relevant specimen's
 *  own locationHistory (whatever real cases/specimens the real caller
 *  queried) — kept a real, pure function with no hidden I/O of its
 *  own. */
export function resolveMortuaryStorageOccupancy(
  allLocations: AssetLocationEntry[],
  specimenLocationHistories: MaterialLocation[][],
): MortuaryStorageOccupancyEntry[] {
  const currentLocationNames = new Set(
    specimenLocationHistories
      .map(resolveMostRecentLocation)
      .filter((entry): entry is MaterialLocation => !!entry)
      .map(entry => entry.location.toLowerCase()),
  );

  return allLocations
    .filter(location => location.locationType === 'storage_slot')
    .map(location => ({ location, occupied: currentLocationNames.has(location.name.toLowerCase()) }));
}

// src/utils/resolveProtocolIdForSpecimen.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, small, shared helper — extracted while wiring
// resolveBlockCassetteColor.ts into handleAddBlock, since a real
// cassette-routing rule can only match on protocolId (see that
// file's own header for why no other "block type" dimension exists
// yet), and a Specimen only ever carries specimenDictionaryEntryId
// directly, not its own resolved protocolId. Same real resolution
// chain generateDefaultMaterial.ts already uses at accession time
// (SpecimenEntry.protocolId), reused here rather than re-derived.
// Deliberately its own file, not inlined into one caller — the real,
// upcoming grossing-scan consumer and Grossing screen (same real
// workflow, per direct follow-up) will need this exact same
// resolution too.
// ─────────────────────────────────────────────────────────────────────────────

import { mockSpecimenDictionaryService } from '@/services/specimenDictionary/mockSpecimenDictionaryService';

/** Returns undefined when the specimen has no real, linked dictionary
 *  entry, the dictionary fails to load, or the linked entry has no
 *  real protocolId of its own — never guesses a substitute protocol. */
export async function resolveProtocolIdForSpecimen(specimenDictionaryEntryId: string | undefined): Promise<string | undefined> {
  if (!specimenDictionaryEntryId) return undefined;
  const res = await mockSpecimenDictionaryService.getAll();
  if (!res.ok) return undefined;
  return res.data.find(e => e.id === specimenDictionaryEntryId)?.protocolId;
}

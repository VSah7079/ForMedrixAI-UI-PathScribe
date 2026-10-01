// src/utils/sharedCassetteSiblings.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "when creating Biopsy Arrays,
// I'm not sure we are dealing with that very well. I suspect that
// every associate specimen gets updated simultaneously since they are
// actual a multi source cassette." Confirmed directly, not assumed:
// the opposite was true — nothing anywhere ever looked at
// HistologyBlock.sharedCassetteId when applying a status/location
// change, so sibling specimens sharing one physical cassette were
// silently left behind. This is the one, real, shared lookup every
// call site needing sibling-awareness (status advance, location
// tracking, label printing) should use — not three separately
// re-implemented traversals that could drift.
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen } from '@/types/case/Specimen';

export interface SharedCassetteSibling {
  specimenId: string;
  specimenLabel: string;
  specimenDescription: string;
  blockId: string;
  blockLabel: string;
  positionInBlock?: number;
}

/**
 * Real, single traversal — every real block, across every real
 * specimen on this case, that shares the given sharedCassetteId.
 * `excludeBlockId` — pass the block the caller is already acting on,
 * so its own record isn't returned as its own "sibling." Sorted by
 * positionInBlock so a caller building a label or a confirmation
 * message shows siblings in the same, real physical order the
 * cassette diagram itself uses (MaterialTreePanel.tsx).
 */
export function findSharedCassetteSiblings(
  specimens: Specimen[],
  sharedCassetteId: string,
  excludeBlockId?: string,
): SharedCassetteSibling[] {
  const siblings: SharedCassetteSibling[] = [];
  for (const sp of specimens) {
    for (const block of sp.blocks ?? []) {
      if (block.sharedCassetteId !== sharedCassetteId) continue;
      if (block.id === excludeBlockId) continue;
      siblings.push({
        specimenId: sp.id,
        specimenLabel: sp.label,
        specimenDescription: sp.description,
        blockId: block.id,
        blockLabel: block.label,
        positionInBlock: block.positionInBlock,
      });
    }
  }
  return siblings.sort((a, b) => (a.positionInBlock ?? 0) - (b.positionInBlock ?? 0));
}

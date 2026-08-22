// src/utils/resolveBlockCassetteColor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up describing the real grossing-
// station workflow: "Context & Protocol Resolution... determines...
// Required cassette media attributes (e.g., PINK for small biopsy,
// GREEN / MESH for cell block)." resolveDecantCassetteColor.ts
// already covered the cell-block half of that sentence (a real
// Decant); this is the real, parallel piece for an ordinary tissue
// block — the "Routine Tissue" side of the same real routing engine,
// evaluateCassetteRouting.ts.
//
// Real, deliberate difference from resolveDecantCassetteColor: an
// ordinary block has no decantType at all — there is no "block-type"
// dimension in CassetteRoutingConditions today, only protocolId,
// priority, originStationId, orderingFacilityId, and caseType. A real
// rule distinguishing "small biopsy" from "routine tissue" has to
// match on the specimen's own resolved protocolId — confirmed
// directly (grepped CassetteRoutingConditions before writing this)
// rather than assuming a field that doesn't exist.
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateCassetteRouting } from './evaluateCassetteRouting';
import type { CassetteRoutingContext } from './evaluateCassetteRouting';
import { fetchCassetteRoutingData } from './fetchCassetteRoutingData';

/**
 * Real, top-level entry point — resolves the real, current
 * cassette-color rule set against an ordinary block's own context
 * (protocolId, priority, originStationId, orderingFacilityId,
 * caseType — no decantType, since that dimension doesn't apply to a
 * real tissue block). Returns undefined (never a fabricated default)
 * on no real match or a service failure — same real posture as
 * resolveDecantCassetteColor.
 */
export async function resolveBlockCassetteColor(
  context: CassetteRoutingContext = {},
): Promise<string | undefined> {
  const data = await fetchCassetteRoutingData();
  if (!data) return undefined;

  const result = evaluateCassetteRouting(context, data.rules, data.protocols, data.colors);
  return result?.primaryColor.colorId;
}

// src/services/protocols/resolvePathwayCountValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "both fields need to be wired into the
// form state, schema validation, and rendering logic" — the schema
// validation half, extracted as its own pure, testable function
// rather than trapped inline inside ProtocolDictionarySection.tsx's
// own canSave expression.
//
// Real rule: defaultCount and defaultPieceCount (IProtocolService.ts)
// are optional — undefined/unset always stays valid, matching every
// existing protocol that predates this UI. When set, each must be a
// real positive integer (a block/decant count of 0 or -1 is
// meaningless). defaultPieceCount is additionally invalid on a
// decant pathway — see that field's own doc comment ("only
// meaningful for materialKind: 'block'").
// ─────────────────────────────────────────────────────────────────────────────

import type { ProtocolPathway } from './IProtocolService';

function isPositiveIntegerOrUnset(n: number | undefined): boolean {
  return n === undefined || (Number.isInteger(n) && n > 0);
}

export function isPathwayCountValid(pathway: ProtocolPathway): boolean {
  return isPositiveIntegerOrUnset(pathway.defaultCount)
    && isPositiveIntegerOrUnset(pathway.defaultPieceCount)
    && !(pathway.materialKind === 'decant' && pathway.defaultPieceCount !== undefined);
}

// src/utils/resolveDecantCassetteColor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Additional Requirements for
// Batch Management: cell blocks... Dedicated Hopper Assignment: Cell
// blocks frequently use distinct cassette colors... to signal fragile
// cytopreparations to histotechnologists."
//
// This is the real, first production wiring of
// evaluateCassetteRouting.ts — that engine has existed, tested, since
// earlier this session, but nothing in production code ever actually
// called it (confirmed directly: zero real call sites anywhere in
// src/pages or src/hooks before this). This is the thin, async
// wrapper that fetches the real rules/colors/protocols and calls the
// real, pure evaluation function — kept deliberately separate from
// that pure function so evaluateCassetteRouting.ts's own tests never
// need real service mocking.
//
// Real, confirmed scope boundary this respects (see
// evaluateCassetteRouting.ts's own header): resolves which LOGICAL
// COLOR a decant's cassette should use. Never touches hopper numbers,
// hardware state, or real-time availability — that's the Engine
// (Layer 2)'s own concern.
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateCassetteRouting } from './evaluateCassetteRouting';
import type { CassetteRoutingContext } from './evaluateCassetteRouting';
import { fetchCassetteRoutingData } from './fetchCassetteRoutingData';
import type { DecantType } from '@/types/case/Material';

/**
 * Real, top-level entry point — resolves the real, current
 * cassette-color rule set against a real decant's own context.
 * Returns undefined (never a fabricated default) when no real rule
 * matches, any of the underlying services fail to load, or the
 * matched rule's own colorId doesn't resolve to a real, known color —
 * callers should treat undefined as "not yet resolved," never guess a
 * substitute.
 */
export async function resolveDecantCassetteColor(
  decantType: DecantType,
  context: Omit<CassetteRoutingContext, 'decantType'> = {},
): Promise<string | undefined> {
  const data = await fetchCassetteRoutingData();
  if (!data) return undefined;

  const result = evaluateCassetteRouting(
    { ...context, decantType },
    data.rules,
    data.protocols,
    data.colors,
  );
  return result?.primaryColor.colorId;
}

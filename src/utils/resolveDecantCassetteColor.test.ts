// @vitest-environment happy-dom
//
// src/utils/resolveDecantCassetteColor.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: cell blocks "frequently use
// distinct cassette colors." Tests against the REAL, seeded rule/color
// data (mockCassetteRoutingRuleService/mockCassetteColorService), not
// synthetic fixtures — this is the first production wiring of
// evaluateCassetteRouting.ts, so proving it resolves correctly against
// what's actually seeded matters more than testing the pure function
// again (already covered by evaluateCassetteRouting.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { resolveDecantCassetteColor } from './resolveDecantCassetteColor';

describe('resolveDecantCassetteColor — real, first production wiring of evaluateCassetteRouting.ts', () => {
  it('a real cell_block decant resolves to the real, seeded Green/Mesh color', async () => {
    const colorId = await resolveDecantCassetteColor('cell_block');
    expect(colorId).toBe('color-green-mesh');
  });

  it('a real residual_fluid decant does not match the cell-block-specific rule', async () => {
    const colorId = await resolveDecantCassetteColor('residual_fluid');
    // Real, honest expectation: no seeded rule targets residual_fluid
    // specifically, so this should NOT resolve to Green/Mesh — either
    // undefined (no match at all) or some other, real seeded default,
    // never the cell-block color by accident.
    expect(colorId).not.toBe('color-green-mesh');
  });

  it('never throws when passed real, additional context (priority) alongside decantType', async () => {
    await expect(resolveDecantCassetteColor('cell_block', { priority: 'STAT' })).resolves.toBeDefined();
  });
});

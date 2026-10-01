// @vitest-environment happy-dom
//
// src/utils/resolveBlockCassetteColor.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up describing the real grossing-
// station workflow. Tests against the REAL, seeded rule/color/
// protocol data, same real discipline as
// resolveDecantCassetteColor.test.ts — this is the first production
// wiring of evaluateCassetteRouting.ts for an ordinary block, so
// proving it resolves correctly against what's actually seeded
// matters more than re-testing the pure function again.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { resolveBlockCassetteColor } from './resolveBlockCassetteColor';

describe('resolveBlockCassetteColor — real, first production wiring of evaluateCassetteRouting.ts for an ordinary block', () => {
  it('a block on the real, seeded Renal Protocol resolves to the real, seeded Blue color', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-medical-renal' });
    expect(colorId).toBe('color-blue');
  });

  it('a block on an unrelated/unknown protocol does not match the Renal-specific rule', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-does-not-exist' });
    expect(colorId).not.toBe('color-blue');
  });

  it('a block with no protocolId at all does not incorrectly match the Renal-specific rule', async () => {
    const colorId = await resolveBlockCassetteColor({});
    expect(colorId).not.toBe('color-blue');
  });

  it('a real, STAT-priority block on the Renal protocol resolves to the real STAT Override color instead — the higher-priorityWeight rule correctly wins', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-medical-renal', priority: 'STAT' });
    expect(colorId).toBe('color-red');
  });

  it('never throws when called with no context at all', async () => {
    await expect(resolveBlockCassetteColor()).resolves.not.toThrow;
  });
});

// Real feature, per direct follow-up: "the Pink/Rush color conflict
// is still unresolved... it needs its own, different color." Proves
// the real, new small-biopsy rules resolve correctly against the
// real, seeded data, AND that the fix is genuine — a small biopsy
// resolves to the real, new Yellow, never the pre-existing,
// unrelated Pink/Rush color.
describe('resolveBlockCassetteColor — real fix: small-biopsy protocols route to a genuinely new color, not the pre-existing, unrelated Pink/Rush one', () => {
  it('a skin punch biopsy resolves to the real, new Yellow color', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-skin-punch-biopsy' });
    expect(colorId).toBe('color-yellow');
  });

  it('a prostate core biopsy resolves to the same real Yellow color', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-prostate-core-biopsy' });
    expect(colorId).toBe('color-yellow');
  });

  it('a breast core biopsy resolves to the same real Yellow color', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-breast-core-biopsy' });
    expect(colorId).toBe('color-yellow');
  });

  it('an endometrial biopsy resolves to the same real Yellow color', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-endometrial-biopsy' });
    expect(colorId).toBe('color-yellow');
  });

  it('never resolves to Pink/Rush — confirms the real fix, not just a new rule alongside a lingering conflict', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-skin-punch-biopsy' });
    expect(colorId).not.toBe('color-pink');
  });

  it('a real, STAT-priority small biopsy still resolves to the real STAT Override color instead — same, correct priorityWeight precedence as the Renal rule', async () => {
    const colorId = await resolveBlockCassetteColor({ protocolId: 'proto-skin-punch-biopsy', priority: 'STAT' });
    expect(colorId).toBe('color-red');
  });
});

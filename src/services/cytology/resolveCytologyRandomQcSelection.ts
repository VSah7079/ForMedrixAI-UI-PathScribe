// src/services/cytology/resolveCytologyRandomQcSelection.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for the actual random QC selection algorithm. Per
// direct correction: "the user doesn't flag for QC, the system
// randomly picks one based on the algorithm... I left out an important
// requirement. The Cytology System follows two types: 1. Cytology GYN
// Results that are Negative - x% of negative cases are sent to
// Cytology QC pool. 2. Cytology GYN Non Negatives, x% of those get
// sent to the Cytology QC pool." Two real, genuinely independent
// rates (CytologyQcSettingsConfig, PS-157/this phase) — "negative"
// here reuses the same real requiresPathologistReview: false signal
// this module already computes, not a second, different negativity
// check.
//
// Deliberately a pure function taking an explicit `randomRoll` (the
// real caller passes Math.random()) rather than calling Math.random()
// internally — the same "resolve at the call site, inject the
// non-deterministic input" posture this module already uses for
// testability (resolvePriorAbnormalPapFactor takes an explicit
// asOfDate for the identical reason).
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyQcSettingsConfig } from './ICytologyQcSettingsService';

export function resolveCytologyRandomQcSelection(
  isNegative: boolean,
  settings: Pick<CytologyQcSettingsConfig, 'negativeRandomSelectionRatePercent' | 'nonNegativeRandomSelectionRatePercent'>,
  randomRoll: number,
): boolean {
  const ratePercent = isNegative
    ? settings.negativeRandomSelectionRatePercent
    : settings.nonNegativeRandomSelectionRatePercent;
  // Math.random()'s own real range is [0, 1) — scaled to [0, 100) so a
  // real 10% rate genuinely selects 10% of real, uniform rolls.
  return randomRoll * 100 < ratePercent;
}

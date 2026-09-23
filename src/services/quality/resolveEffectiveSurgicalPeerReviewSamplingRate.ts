// src/services/quality/resolveEffectiveSurgicalPeerReviewSamplingRate.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. Real, per direct guidance's own worked design: "High=3x,
// Moderate=2x, Routine=1x" — the effective sampling rate for a case is
// its activity's own base samplingPercentage times the real, configured
// multiplier for that case's own subspecialty (1x — unweighted — for
// any subspecialty with no configured weight, or for a case with no
// known subspecialtyId at all, matching this app's own "absence means
// the neutral default" convention). Clamped to 100 — a multiplier
// pushing the effective rate past 100% is a real, honest "always
// sample this," not a nonsensical >100% probability.
//
// Deliberately a pure function taking already-resolved data (the real
// weight list, not a lookup this function performs itself) — same
// "resolve async/real data at the call site" posture as every other
// pure resolver in this app.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaSubspecialtyRiskWeight } from '@/types/quality/QaSubspecialtyRiskWeight';

export function resolveEffectiveSurgicalPeerReviewSamplingRate(
  baseRatePercent: number | undefined,
  weights: QaSubspecialtyRiskWeight[],
  subspecialtyId: string | undefined,
): number {
  if (!baseRatePercent || baseRatePercent <= 0) return 0;

  const multiplier = (subspecialtyId && weights.find(w => w.subspecialtyId === subspecialtyId)?.multiplier) || 1;
  return Math.min(baseRatePercent * multiplier, 100);
}

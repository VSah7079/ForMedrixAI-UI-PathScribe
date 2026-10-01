// src/services/quality/resolveSurgicalPeerReviewSelectionForCase.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. The real, per-case entry point for surgical post-sign-out
// peer review selection — combines the activity's own base
// samplingPercentage (PS-117) with the case's real, configured
// subspecialty risk weight (this ticket), then rolls the same real,
// genuinely-random draw every sampling decision in this app uses
// (shouldRandomlySampleForCodeReview.ts — see resolveQaActivity
// SelectionForCase.ts's own header for why that's a deliberate reuse,
// not a second concept). Deliberately its own function, not folded into
// PS-117's generic engine itself — subspecialty-weighted stratified
// sampling is real, additional infrastructure layered on top of the
// generic engine's flat-rate model, per direct guidance.
// ─────────────────────────────────────────────────────────────────────────────

import { shouldRandomlySampleForCodeReview } from '@/services/billing/shouldRandomlySampleForCodeReview';
import { resolveEffectiveSurgicalPeerReviewSamplingRate } from './resolveEffectiveSurgicalPeerReviewSamplingRate';
import type { QaSubspecialtyRiskWeight } from '@/types/quality/QaSubspecialtyRiskWeight';

export function resolveSurgicalPeerReviewSelectionForCase(
  baseRatePercent: number | undefined,
  weights: QaSubspecialtyRiskWeight[],
  subspecialtyId: string | undefined,
): boolean {
  const effectiveRate = resolveEffectiveSurgicalPeerReviewSamplingRate(baseRatePercent, weights, subspecialtyId);
  return shouldRandomlySampleForCodeReview(effectiveRate);
}

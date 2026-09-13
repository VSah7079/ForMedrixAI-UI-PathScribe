// src/services/cytology/resolveIsRetroactiveScuEscalation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own CLIA workload specification, Phase 2:
// "Retroactive Weight Adjustment (Initial FOV -> Manual Rescreen): If a
// cytotechnologist starts an automated FOV review (0.5 SCU), finds an
// abnormality, and pivots to a full manual review (1.5 SCU)... allow
// the current case to finish (preventing orphaned clinical data) but
// immediately block entry to the next case."
//
// Real, deliberate simplification of the original "separate
// adjust-event API" design: since this app's own real, existing save
// flow already re-evaluates the full review_mode at every save, a
// genuine escalation is simply detected by comparing the review's own,
// previously-saved reviewMode against the one being submitted now —
// no separate event/endpoint needed. This is the real, pure detector
// the save flow checks before deciding whether to allow an
// over-capacity save through (an escalation) or hard-block it (a
// brand-new review that was never going to fit at all).
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewMode } from '@/types/cytology/CytologyReviewRecord';
import { resolveCytologyScuWeight } from './resolveCytologyScuWeight';

export function resolveIsRetroactiveScuEscalation(
  previouslySavedReviewMode: CytologyReviewMode,
  newReviewMode: CytologyReviewMode,
): boolean {
  return resolveCytologyScuWeight(newReviewMode) > resolveCytologyScuWeight(previouslySavedReviewMode);
}

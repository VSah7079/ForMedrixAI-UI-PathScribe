// src/services/cytology/resolvePriorAbnormalPapFactor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared, DATA-DRIVEN resolution of the one High-Risk criterion
// this app already has real data for: "Prior abnormal Pap within the
// last 3–5 years" (CytologyHighRiskFactors.priorAbnormalPapWithinLookback).
// Every other real criterion (HPV co-testing, immunosuppression, DES
// exposure, clinical symptoms) has no real, existing data source yet —
// this one does, because CytologyReviewRecord (Phase 5) is this app's
// own real, auditable screening history, already carrying
// requiresPathologistReview (Phase 2) as the real "was this NILM-tier
// or genuinely abnormal" signal — reused directly here, not
// re-derived a second, different way.
//
// Deliberately a pure function over an already-fetched review list —
// the real caller is responsible for gathering a patient's own past
// reviews across their other cytology specimens (a real, separate
// cross-case lookup this app doesn't have a single service call for
// yet), same "resolve at the call site" posture as every other real
// resolver in this module.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

/**
 * True if ANY of the given prior reviews (a) genuinely required
 * pathologist review — the real, already-established "not NILM-tier"
 * signal — and (b) falls within the real lookback window, measured
 * back from `asOfDate`. `lookbackYears` defaults to 5 — the real,
 * conservative upper bound of the given 3–5 year range, matching the
 * standard, cautious posture this whole module already follows
 * (an unresolved category defaults to requiring review, never the
 * reassuring answer — the same reasoning applies here: a shorter
 * lookback window would under-flag real risk).
 */
export function resolvePriorAbnormalPapFactor(
  priorReviews: Pick<CytologyReviewRecord, 'requiresPathologistReview' | 'recordedAt'>[],
  asOfDate: Date,
  lookbackYears = 5,
): boolean {
  const cutoff = new Date(asOfDate);
  cutoff.setFullYear(cutoff.getFullYear() - lookbackYears);

  return priorReviews.some(r => r.requiresPathologistReview && new Date(r.recordedAt) >= cutoff);
}

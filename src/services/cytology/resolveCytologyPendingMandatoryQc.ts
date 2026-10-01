// src/services/cytology/resolveCytologyPendingMandatoryQc.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for "Impact on Cytotechnologist Sign-Out
// Workflow" — per direct guidance: a case flagged IS_HIGH_RISK is
// routed into the real Mandatory Targeted Pre-Sign-Out QC Queue, and
// stays blocked from CT sign-out UNTIL a secondary QC Cytotechnologist
// or Pathologist performs a full rescreen and clears/confirms it.
// Deliberately reuses the real, existing CytologyReviewRole value —
// 'qc_targeted_high_risk' — as the real, already-built signal for "the
// mandatory targeted QC actually happened," rather than inventing a
// second, parallel "cleared" flag.
//
// The result of this function is the real, correct input for
// resolveCytologySignOutGate's own isFlaggedForQc parameter — this
// resolver decides WHETHER the flag still applies; the gate function
// itself stays agnostic to why.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyHighRiskResult } from './resolveCytologyHighRiskStatus';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

export function resolveCytologyPendingMandatoryQc(
  highRiskResult: CytologyHighRiskResult,
  existingReviews: Pick<CytologyReviewRecord, 'role'>[],
): boolean {
  if (!highRiskResult.isHighRisk) return false;
  const clearedByTargetedQc = existingReviews.some(r => r.role === 'qc_targeted_high_risk');
  return !clearedByTargetedQc;
}

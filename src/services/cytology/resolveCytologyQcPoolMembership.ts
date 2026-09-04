// src/services/cytology/resolveCytologyQcPoolMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for whether a specimen still belongs in the real
// QC pool/tile — per direct follow-up, a genuinely distinct worklist
// destination from the general, never-yet-screened Pool, specifically
// for cases already flagged for mandatory QC and awaiting that
// specific review.
//
// Generalizes resolveCytologyPendingMandatoryQc's own real logic
// (Phase 13 — cleared only by a matching, real CytologyReviewRecord
// role, never merely by the flag being old) to cover BOTH real QC
// reasons a specimen can carry (Specimen.cytologyScreening.qcFlag,
// types/case/Specimen.ts): the routine random-10%-sample selection
// AND the mandatory high-risk targeting. A random-selection flag is
// cleared only by a real qc_random_selection review; a
// targeted-high-risk flag only by a real qc_targeted_high_risk one —
// never cross-cleared by the other, since they are genuinely
// different real QC obligations even though both use the same real
// flag shape.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyScreeningRecord } from '@/types/case/Specimen';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';

export function resolveCytologyQcPoolMembership(
  qcFlag: CytologyScreeningRecord['qcFlag'],
  existingReviews: Pick<CytologyReviewRecord, 'role'>[],
): boolean {
  if (!qcFlag) return false;
  const clearingRole = qcFlag.reason === 'random_selection' ? 'qc_random_selection' : 'qc_targeted_high_risk';
  const cleared = existingReviews.some(r => r.role === clearingRole);
  return !cleared;
}

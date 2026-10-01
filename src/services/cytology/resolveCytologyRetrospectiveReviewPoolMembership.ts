// src/services/cytology/resolveCytologyRetrospectiveReviewPoolMembership.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for whether a specimen still belongs in the real
// 5-Year Retrospective Review worklist tile — matching
// resolveCytologyQcPoolMembership.ts's own established pattern for a
// genuinely different real pool: this one holds ALREADY-SIGNED-OUT
// specimens flagged by resolveCytologyFiveYearRetrospectiveLookback.ts,
// not pre-sign-out cases awaiting mandatory QC.
//
// Real, simpler clearing condition than the QC pool's own: a
// retrospective review is cleared the moment a real reviewer records
// a real, completed outcome directly on the flag itself
// (retrospectiveReviewFlag.outcome) — there is no separate
// CytologyReviewRecord role standing in for "this was reviewed," since
// the specimen this flag lives on has already been signed out and
// released; a second, full re-review record is not the real mechanism
// CAP's own requirement calls for here.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyScreeningRecord } from '@/types/case/Specimen';

export function resolveCytologyRetrospectiveReviewPoolMembership(
  retrospectiveReviewFlag: CytologyScreeningRecord['retrospectiveReviewFlag'],
): boolean {
  if (!retrospectiveReviewFlag) return false;
  return retrospectiveReviewFlag.outcome === undefined;
}

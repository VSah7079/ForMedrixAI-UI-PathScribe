// src/services/quality/qualityTatInputs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: the joins the Contribution dashboard's Quality tab made before
// its TAT outlier calculations, moved out of QualityTab.tsx:
//   - each case gets its performing lab, resolved from its ordering facility
//     (TAT targets can be scoped to either);
//   - facility names by id, for the outlier rows;
//   - the user's delegations plus their informal review requests, the
//     records consultation response / awaiting TAT is measured on.
// ─────────────────────────────────────────────────────────────────────────────
import type { Facility } from '../facilities/IFacilityService';
import { resolvePerformingLabFacilityId } from '../facilities/IFacilityService';
import type { DelegationRecord } from '../delegations/IDelegationService';
import { informalReviewsAsDelegations } from '../delegations/delegationRules';
import type { InformalReviewRequest } from '@/types/reports/InformalReviewRequest';

/** Each case with `performingLabFacilityId` from its ordering facility (undefined when that has no lab). */
export function withPerformingLabs<C extends { order?: { facilityId?: string } }>(
  cases: readonly C[], facilities: readonly Facility[],
): Array<C & { performingLabFacilityId?: string }> {
  const labByFacilityId = new Map<string, string | undefined>();
  for (const f of facilities) labByFacilityId.set(f.id, resolvePerformingLabFacilityId(f));
  return cases.map(c => ({
    ...c,
    performingLabFacilityId: c.order?.facilityId ? labByFacilityId.get(c.order.facilityId) : undefined,
  }));
}

export function facilityNamesById(facilities: readonly Facility[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const f of facilities) names[f.id] = f.name;
  return names;
}

/** Delegation records plus informal review requests, for consultation TAT. */
export function consultationRecords(
  delegations: readonly DelegationRecord[], informalReviews: readonly InformalReviewRequest[],
): DelegationRecord[] {
  return [...delegations, ...informalReviewsAsDelegations(informalReviews)];
}

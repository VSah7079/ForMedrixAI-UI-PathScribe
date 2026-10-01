// src/services/auth/resolveFinalizeAuthorityContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-327 (Batch 331): what every sign-out path needs before it can ask
// canFinalizeCase() / resolveCountersignRequiredTypeIds() who may sign:
//   • the participation-type catalog (with per-lab authorityOverrides and
//     PS-341 jurisdictionProfiles),
//   • the case's performing lab (from the ordering facility), and
//   • the jurisdiction whose country profile applies.
//
// Moved here from useSignOutWorkflow.ts (Surgical Pathology) so Cytology
// and Autopsy resolve authority the same way instead of each keeping a
// copy.
//
// The jurisdiction is the performing lab's Facility.jurisdiction, unless
// the caller passes `jurisdictionOverride`. Autopsy passes the case's
// legal/coroner jurisdiction (AutopsyCaseDetails.jurisdiction), per Pete.
// A lab's own authorityOverrides still win over any country profile
// (resolveParticipationTypeAuthority's precedence is unchanged).
//
// Never rejects: a failed lookup yields an empty catalog / no lab, which
// canFinalizeCase() already treats as its safe fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveCasePerformingLabScope } from '@/services/facilities/resolveCasePerformingLabScope';
import { getParticipationTypeLookup } from '@/utils/participationTypeLookup';
import type { ParticipationTypeRecord } from '@/services/participationTypes/IParticipationTypeService';
import type { Jurisdiction } from '@/types/systemConfig';

export interface FinalizeAuthorityContext {
  participationTypes: ParticipationTypeRecord[];
  performingLabFacilityId: string | undefined;
  jurisdiction: Jurisdiction | undefined;
}

export async function resolveFinalizeAuthorityContext(
  caseData: { order?: { facilityId?: string | null } | null } | null | undefined,
  options: { jurisdictionOverride?: Jurisdiction | null } = {},
): Promise<FinalizeAuthorityContext> {
  const [participationTypes, scope] = await Promise.all([
    getParticipationTypeLookup().catch(() => [] as ParticipationTypeRecord[]),
    resolveCasePerformingLabScope(caseData?.order?.facilityId),
  ]);
  return {
    participationTypes,
    performingLabFacilityId: scope.performingLabFacilityId,
    jurisdiction: options.jurisdictionOverride ?? scope.jurisdiction,
  };
}

// src/services/facilities/resolveCasePerformingLabScope.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("healthcare regulatory frameworks, college
// requirements, and legal liabilities are strictly jurisdiction-bound"):
// resolves the two facts every signing-authority decision needs about a
// case — its real performing lab's facility id, and that lab's own
// `Facility.jurisdiction` — from the case's ordering facility id.
//
// The jurisdiction is deliberately the PERFORMING lab's, not the
// ordering site's: when an ordering facility delegates its work to a
// separate performing lab (`Facility.performingLabFacilityId`), it's the
// lab where the diagnosis is actually made and signed whose country's
// rules (NATA/RCPath/RCPI/CPSO/RCPSC/MHW/EU member-state acts) govern
// who may sign out.
//
// Shared, extracted rather than duplicated: useSignOutWorkflow.ts's real
// sign-out/finalize gates and CaseTeamModal.tsx's case-team editor both
// need exactly this resolution — two independently-maintained copies
// could quietly disagree on which country governs the same case (the
// editor offering a role the sign-out gate then treats differently).
//
// Best-effort by design: any failed lookup resolves the affected field
// to undefined rather than throwing. Undefined simply skips that tier in
// resolveParticipationTypeAuthority()/isParticipationTypeOfferedIn() —
// falling back to platform defaults / global-only types, never granting
// anything extra.
// ─────────────────────────────────────────────────────────────────────────────

import { facilityService } from '@/services';
import { resolvePerformingLabFacilityId } from './IFacilityService';
import type { Jurisdiction } from '@/types/systemConfig';

export interface CasePerformingLabScope {
  performingLabFacilityId: string | undefined;
  jurisdiction: Jurisdiction | undefined;
}

const EMPTY: CasePerformingLabScope = { performingLabFacilityId: undefined, jurisdiction: undefined };

export async function resolveCasePerformingLabScope(
  orderingFacilityId: string | null | undefined,
): Promise<CasePerformingLabScope> {
  // Never rejects — callers put this inside a Promise.all alongside
  // other loads (CaseTeamModal.tsx), where a rejection here would take
  // the whole modal's data load down with it, not just this lookup.
  try {
    return await resolveScope(orderingFacilityId);
  } catch {
    return EMPTY;
  }
}

async function resolveScope(orderingFacilityId: string | null | undefined): Promise<CasePerformingLabScope> {
  if (!orderingFacilityId) return EMPTY;
  const facilityRes = await facilityService.getById(orderingFacilityId).catch(() => null);
  if (!facilityRes?.ok) return EMPTY;
  const labId = resolvePerformingLabFacilityId(facilityRes.data);
  if (!labId) return EMPTY;
  // The common case — the ordering facility IS the performing lab —
  // reuses the record already fetched; only a real delegation to a
  // separate lab costs one more lookup.
  if (labId === facilityRes.data.id) return { performingLabFacilityId: labId, jurisdiction: facilityRes.data.jurisdiction };
  const labRes = await facilityService.getById(labId).catch(() => null);
  return { performingLabFacilityId: labId, jurisdiction: labRes?.ok ? labRes.data.jurisdiction : undefined };
}

// src/services/caseRegistry/resolveCaseMaskScopeCandidates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: given a case's resolved Department and
// performing-lab Facility, returns the ordered list of real scope
// points to try for a CaseMask — most specific first. The caller
// (allocateNextCaseNumber/previewNextCaseNumber) tries each in order
// and uses the first one with a real, defined CaseMask.
//
// Facility → Enterprise is a single, direct hop, not a recursive walk
// — same real, established pattern as
// resolveInterfaceEngineConnectionForFacility (services/facilities/
// IFacilityService.ts): parentId can only ever point to an
// isEnterprise facility, enforced in FacilityEditorModal.tsx's own
// Parent Enterprise picker, so there's never a deeper chain to climb.
//
// Pure, data-only — takes the full real facility list rather than
// fetching internally, same reasoning as every other resolveX
// function in this app (resolveInterfaceEngineConnectionForFacility,
// resolveLisRoutingForFacility, resolveDepartmentOverride, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import type { CaseMaskScopeType } from '@/types/config/CaseMask';
import type { Facility } from '../facilities/IFacilityService';

export interface CaseMaskScopeCandidate {
  scopeType: CaseMaskScopeType;
  scopeId: string;
}

export function resolveCaseMaskScopeCandidates(
  departmentId: string | undefined,
  performingLabFacility: Facility | undefined,
  allFacilities: Facility[],
): CaseMaskScopeCandidate[] {
  const candidates: CaseMaskScopeCandidate[] = [];

  if (departmentId) {
    candidates.push({ scopeType: 'department', scopeId: departmentId });
  }

  if (performingLabFacility) {
    candidates.push({ scopeType: 'facility', scopeId: performingLabFacility.id });

    // Single, direct hop to the Enterprise ancestor — never a deeper
    // chain, per parentId's own, established constraint.
    const enterprise = performingLabFacility.isEnterprise
      ? performingLabFacility
      : performingLabFacility.parentId
        ? allFacilities.find(f => f.id === performingLabFacility.parentId)
        : undefined;

    // Don't push the same real scope point twice — a performing lab
    // that is itself the Enterprise (isEnterprise: true, no parentId)
    // would otherwise appear as both 'facility' and 'enterprise' for
    // the same real scopeId, which is a real, misleading duplicate,
    // not a genuinely different fallback level.
    if (enterprise && enterprise.id !== performingLabFacility.id) {
      candidates.push({ scopeType: 'enterprise', scopeId: enterprise.id });
    }
  }

  return candidates;
}

// src/services/qualityAssurance/qaScope.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: moved out of components/QualityAssurance/
// qaReportUtils.ts, where it originally lived as UI-layer code. A real
// service interface (ICytologyQaReportService.ts) needs to accept a
// scope as a real parameter — the same real scope a future backend
// query would filter by (WHERE facility_id = ? / WHERE client_id = ?)
// — and a service in services/ must never depend on a type defined in
// components/; that's a real layering violation regardless of how
// small the type is. qaReportUtils.ts now re-exports from here so the
// seven existing real QA tabs already using QaScope need no changes.
// Real, direct confirmation before moving this: caseMatchesScope's own
// 'organisation' branch depends on getOrganisationByHospitalId, which
// already lives in services/organisation/ — a real, ordinary services-
// to-services dependency, not a second layering problem to solve.
// ─────────────────────────────────────────────────────────────────────────────

import { getOrganisationByHospitalId } from '@/services/organisation/organisationService';

export type QaScope =
  | { level: 'enterprise' }
  | { level: 'client'; clientId: string }
  | { level: 'organisation'; organisationId: string };

/** Real Case shape is untyped `any` at this layer (matches the loose
 *  typing caseRouter.getAll() already returns elsewhere in this
 *  codebase) — only the fields this needs. */
export function caseMatchesScope(c: { order?: { clientId?: string }; originHospitalId?: string }, scope: QaScope): boolean {
  if (scope.level === 'enterprise') return true;
  if (scope.level === 'client') return c?.order?.clientId === scope.clientId;
  const org = getOrganisationByHospitalId(c?.originHospitalId ?? '');
  return org?.id === scope.organisationId;
}

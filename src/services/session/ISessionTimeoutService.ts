// src/services/session/ISessionTimeoutService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Service interface for idle-session-timeout resolution.
// Dev: mockSessionTimeoutService (localStorage-backed org default +
//   per-performing-lab override lookup via facilityService)
// Live: FirestoreSessionTimeoutService (not yet built — stub only)
//
// Phase 1 of the Inactivity Timeout & Draft Recovery spec. Structurally mirrors
// components/Config/AI/orchestratorModeConfig.ts's proven org-default/
// per-client-override shape, but as a real services/ interface/mock pair
// rather than a components/-local module — that earlier version lived
// directly under services/session/ without following this codebase's
// established interface/mock/firestore-stub pattern, caught and
// corrected by Pete before it drifted further.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export interface ISessionTimeoutService {
  /** Org-wide default, in minutes. Fallback constant (15, matching the
   *  original spec's suggested default) if nothing has been configured yet. */
  getOrgDefault(): Promise<ServiceResult<number>>;

  setOrgDefault(minutes: number): Promise<ServiceResult<void>>;

  /** Full resolution for the currently-open case: org default, overridden
   *  by whichever internal client actually performs the work on this case
   *  (resolved via resolvePerformingLabFacilityId(), same as every other
   *  lab-scoped setting) if that client has Client.idleTimeoutMinutesOverride
   *  set. Pass undefined when no case is currently open (Worklist, Home,
   *  Configuration, etc.) — resolves straight to the org default.
   *  Fails safe toward the org default (the stricter, known-good value)
   *  on any lookup failure, rather than an unbounded session. */
  resolveEffectiveMinutes(orderingClientId?: string): Promise<ServiceResult<number>>;
}

// ── Shared utility, not implementation-specific ─────────────────────────────
// ProtectedRoute.tsx wraps every authenticated route equally and has no
// built-in awareness of "is there a specific case open right now" — this
// keeps that detection self-contained rather than threading case context
// through every page that renders a case. Not part of the service
// interface itself since it does no data access at all, just string
// parsing — both the mock and (eventual) real implementation would need
// it identically.
export function extractCaseIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/case\/([^/]+)/);
  return match ? match[1] : null;
}

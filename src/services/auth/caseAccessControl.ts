// src/services/auth/caseAccessControl.ts
// ─────────────────────────────────────────────────────────────
// Lives alongside institutionService.ts (this folder's existing
// "current session tenant" helper — see that file's own header for why
// its previous implementation was broken and got fixed alongside this).
// The real hospital/organisation access-control boundary — replaces the
// hardcoded USER_HOSPITAL_MAP that used to live inside mockCaseService.ts's
// listCasesForUser() and was NEVER enforced on getCase()/getAll(), meaning
// any user with a case ID (via search, a shared link, etc.) could open a
// case belonging to any hospital, in any organisation, regardless of that
// map. That was found and is being closed here.
//
// Design principles (standard multi-tenant SaaS / healthcare access model,
// chosen specifically to hold up under HIPAA "minimum necessary," UK
// GDPR/DSPT, EU GDPR data minimisation, and equivalent AU/CA frameworks —
// none of these are unique, all are the same shape: deny by default,
// explicit scope, auditable):
//
//   1. DENY BY DEFAULT. No organisationId resolved on the session → no
//      case access, full stop. Never fall back to "show everything" on a
//      missing/failed lookup.
//   2. The Enterprise Facility is the tenant wall. A case belongs to
//      exactly one real Enterprise Facility (resolved via
//      resolveTenantFacility.ts — Case.originHospitalId legacy-maps
//      1:1 to one, not to a Site; see that function's own comment,
//      and Facility.legacyTenantIds' doc comment for why this is a
//      deliberate Phase 1 bridge, not a permanent design). A user can
//      only see cases whose Enterprise Facility matches their own
//      session's.
//   3. Enterprise-wide visibility within your own organisation is the
//      DEFAULT once the tenant check passes — not a separate opt-in flag.
//      This matches both the actual data granularity available today
//      (Case doesn't carry a real Site-level identifier, only the
//      Organisation-granularity legacy hospital ID) and the explicit
//      requirement that a Trust-wide pathologist can see across their own
//      enterprise. True single-site-only restriction within one
//      organisation isn't buildable without Case carrying a real Site.id
//      instead — flagged as a deliberate limitation, not built here.
//   4. role: 'superadmin' bypasses the organisation check entirely — the
//      standard "platform admin" pattern (a genuine PathScribe-internal
//      support role needs cross-tenant visibility; an ordinary user's
//      home organisation should not). This is a real, if blunt,
//      instrument — see this file's own note in the accompanying
//      conversation about how many existing demo login credentials are
//      already hardcoded to this role.
//   5. Single enforcement point. This module is called from CaseRouter.ts
//      — the one façade every case-read path in the app already funnels
//      through (getCase/getAll/listCasesForUser) — rather than being
//      duplicated inside each underlying mock service. Duplicated
//      authorization logic is exactly how the old narrow hospital-map
//      hack happened: written once for one list view, never applied
//      anywhere else, and nobody could easily tell it wasn't real
//      enforcement.
//   6. Denied access returns "not found," not an explicit "forbidden."
//      This is a deliberate choice (OWASP-aligned) to avoid confirming a
//      case exists to someone not authorized to see it — but the audit
//      log entry underneath still distinguishes an actual not-found from
//      a denied access, so the compliance record stays accurate even
//      though the API surface is deliberately vague to the caller.
//
// IMPORTANT CAVEAT — read before treating this as "solved":
// This is a client-side mock. A real backend MUST enforce this
// server-side; a check running in the browser can be bypassed by anyone
// editing their own JS. What's built here models the correct SHAPE of
// the access-control decision (deny by default, explicit tenant scope,
// audited) so the real backend implementation has a clear, already-
// reasoned spec to match — it is not itself a security boundary against
// a malicious client.
// ─────────────────────────────────────────────────────────────

import { resolveTenantFacility } from './resolveTenantFacility';
import type { Facility } from '../facilities/IFacilityService';

const SESSION_STORAGE_KEY = 'pathscribe-user';

export interface SessionUser {
  id: string;
  role?: 'pathologist' | 'admin' | 'pathologist-admin' | 'superadmin';
  organisationId?: string;
  canAccessCrossTenantQa?: boolean;
  canViewPediatric?: boolean;
  canViewOrchestration?: boolean;
  firstName?: string;
  lastName?: string;
}

/**
 * Reads the current session user directly from localStorage — the mock
 * services here are plain TS modules outside the React tree and can't use
 * useAuth()/AuthContext, so they read the same persisted session object
 * AuthContext itself writes to. Synchronous by design (no network round
 * trip needed for a mock), matching how the rest of this mock layer reads/
 * writes localStorage directly (see mockStorage.ts's storageGet/Set).
 */
export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id) return null;
    return { id: parsed.id, role: parsed.role, organisationId: parsed.organisationId, canAccessCrossTenantQa: parsed.canAccessCrossTenantQa, canViewPediatric: parsed.canViewPediatric, canViewOrchestration: parsed.canViewOrchestration, firstName: parsed.firstName, lastName: parsed.lastName };
  } catch {
    // Fail safe, not fail open — a corrupted/unreadable session resolves
    // to "no session," which denies access, not "assume trusted."
    return null;
  }
}

/**
 * The actual decision: can this session see this case?
 *
 * `caseRecord` only needs enough shape to resolve organisation + who it's
 * assigned to — kept minimal deliberately so this doesn't need to import
 * the full Case type and create a circular dependency with case services.
 *
 * DELETED (this pass): canAccessCase() used to live here as a standalone
 * function. Found genuinely orphaned during a direct audit — CaseRouter.ts
 * was refactored to call canAccessCaseWithPools()/resolveCaseAccess()
 * instead (dimension-3 pool enforcement), and nothing else in the app
 * still called the original. Rather than leave superseded dead code
 * behind (the exact class of risk a direct review flagged), it's removed.
 * Equivalent call for anything that only needs dimension 1: 
 * resolveCaseAccess(session, caseRecord, null).granted
 */

// ─────────────────────────────────────────────────────────────────────────
// resolveCaseAccess() — the real, unified access decision.
//
// Adapted from a real ABAC/ReBAC dimensional model (four dimensions:
// tenant boundary, facility/lab scope, pool/subspecialty, case
// relationship), scaled to what's real and buildable in this codebase
// tonight rather than a full policy-engine rebuild:
//
//   Dimension 1 (Tenant Boundary)     — real, enforced: canAccessCase()
//     above, unchanged, still the tenant wall.
//   Dimension 2 (Facility/Lab Scope)  — deliberately pass-through today.
//     This file's own existing design principle #3 already covers this:
//     Case has no real Site-level identifier, so "enterprise-wide within
//     your own organisation" IS the correct current behavior, not a gap.
//     Kept explicit here rather than silently skipped, so a future
//     Case.siteId addition has an obvious place to plug in.
//   Dimension 3 (Pool/Subspecialty)   — NEW, real enforcement, added
//     here. Found via direct investigation: Subspecialty.userIds
//     ("Members / assigned physicians") was a real, populated field
//     never once consulted by anything gating visibility. Fixed here,
//     but deliberately safe to turn on: gated behind
//     Subspecialty.isWorkgroupEnabled, which is false on every currently
//     seeded subspecialty — so this has zero effect on any existing
//     case's visibility today, and only restricts a pool once an admin
//     explicitly opts it in via Config -> System -> Subspecialties. Same
//     deny-by-default-but-backward-compatible shape as everything else
//     in this file.
//   Dimension 4 (Case Relationship)   — NOT read-access; this dimension
//     governs WRITE guards (finalize/sign-out), not visibility — a
//     pathologist who isn't yet a case participant must still be able to
//     see and claim a pool case, that's the entire point of a pool. See
//     canFinalizeCase() below instead.
//
// IMPORTANT CAVEAT — same as canAccessCase() above: this is a client-side
// mock. Real enforcement of dimension 3 needs the equivalent check added
// to firestore.rules, not just here.
// ─────────────────────────────────────────────────────────────────────────

export interface CaseAccessSubspecialty {
  id: string;
  userIds: string[];
  isWorkgroup: boolean;
  isWorkgroupEnabled: boolean;
}

export type CaseAccessDecision =
  | { granted: true; dimension: 'superadmin' | 'tenant' | 'pool-open' | 'pool-member' | 'assigned-participant' | 'admin-override'; reason: string }
  | { granted: false; dimension: 'no-session' | 'no-case' | 'no-org' | 'tenant-mismatch' | 'pool-restricted' | 'not-a-participant'; reason: string };

/**
 * The real, unified read-access decision — evaluates dimensions 1 and 3
 * together and returns WHY, not just whether. `subspecialty` should be
 * the resolved Subspecialty record for `caseRecord.subspecialtyId` if the
 * case has one (the caller resolves this — kept out of this function to
 * avoid a new cross-service dependency, matching this file's existing
 * pattern). `enterpriseFacilities` is every real, isEnterprise: true
 * Facility (caller's responsibility to fetch/cache once — see
 * CaseRouter.ts's own getEnterpriseFacilityLookup(), same pattern as
 * getSubspecialtyLookup()) — Phase 1 of the Organisation/Site ->
 * Facility migration: resolves session.organisationId and
 * caseRecord.originHospitalId (still their original legacy string
 * values, untouched until Phase 3) each through
 * resolveTenantFacility.ts against this same real list, and compares
 * the two REAL Facility.id results, rather than trusting either legacy
 * string's equality directly or resolving through
 * organisationService.ts's own hardcoded, incomplete legacyMap.
 */
export function resolveCaseAccess(
  session: SessionUser | null,
  caseRecord: { originHospitalId?: string | null; subspecialtyId?: string | null; status?: string } | null | undefined,
  subspecialty?: CaseAccessSubspecialty | null,
  enterpriseFacilities: Facility[] = []
): CaseAccessDecision {
  if (!caseRecord) return { granted: false, dimension: 'no-case', reason: 'No case record to evaluate.' };
  if (!session) return { granted: false, dimension: 'no-session', reason: 'No active session.' };

  if (session.role === 'superadmin') {
    return { granted: true, dimension: 'superadmin', reason: 'Platform-admin bypass.' };
  }

  if (!session.organisationId) {
    return { granted: false, dimension: 'no-org', reason: 'No organisation resolved on this session.' };
  }

  const sessionTenant = resolveTenantFacility(session.organisationId, enterpriseFacilities);
  const caseTenant = resolveTenantFacility(caseRecord.originHospitalId, enterpriseFacilities);
  if (!sessionTenant || !caseTenant || caseTenant.id !== sessionTenant.id) {
    return { granted: false, dimension: 'tenant-mismatch', reason: 'Case does not belong to this session\'s organisation.' };
  }

  // Dimension 3 — only actually restricts anything when the specific
  // subspecialty has been explicitly opted into workgroup enforcement.
  if (subspecialty?.isWorkgroup && subspecialty.isWorkgroupEnabled) {
    const isMember = subspecialty.userIds.includes(session.id);
    if (!isMember) {
      return { granted: false, dimension: 'pool-restricted', reason: `Not a member of the ${subspecialty.id} pool, which has membership enforcement enabled.` };
    }
    return { granted: true, dimension: 'pool-member', reason: `Member of the ${subspecialty.id} pool.` };
  }

  return { granted: true, dimension: 'pool-open', reason: 'Tenant boundary satisfied; no pool-membership restriction in effect.' };
}

// ─────────────────────────────────────────────────────────────────────────
// canFinalizeCase() — Dimension 4 (Case Relationship), as a real WRITE
// guard, not a visibility filter. Found via direct investigation:
// CaseParticipant.participationTypeIds (real, populated — 'primary',
// 'attending', 'consultant', 'resident', 'second_opinion') was never once
// consulted by anything gating who can actually sign a case out. Today,
// any user who can VIEW a case (passes resolveCaseAccess above) can also
// finalize/sign it out, with no check that they have any real
// relationship to that specific case at all — a genuine gap for exactly
// the write-guard pattern real EHR/LIS access models require.
//
// Deliberately narrow: only gates the FINALIZE/SIGN-OUT transition, not
// every case write (draft edits, comments, etc. legitimately involve
// people who aren't yet a formal participant — a resident drafting
// before an attending is even assigned, for instance).
// ─────────────────────────────────────────────────────────────────────────

export interface CaseFinalizeParticipant {
  staffId: string;
  status: 'active' | 'removed';
  participationTypeIds: string[];
}

const FINALIZE_ELIGIBLE_PARTICIPATION_TYPES = ['primary', 'attending'];

export function canFinalizeCase(
  session: SessionUser | null,
  participants: CaseFinalizeParticipant[] | null | undefined
): CaseAccessDecision {
  if (!session) return { granted: false, dimension: 'no-session', reason: 'No active session.' };
  if (session.role === 'superadmin' || session.role === 'admin' || session.role === 'pathologist-admin') {
    return { granted: true, dimension: 'admin-override', reason: 'Administrative role — supervisor override.' };
  }

  const activeParticipants = participants ?? [];
  const isEligibleParticipant = activeParticipants.some(p =>
    p.status === 'active' &&
    p.staffId === session.id &&
    p.participationTypeIds.some(t => FINALIZE_ELIGIBLE_PARTICIPATION_TYPES.includes(t))
  );

  if (!isEligibleParticipant) {
    return {
      granted: false,
      dimension: 'not-a-participant',
      reason: 'Only the assigned Primary/Attending, or an administrative supervisor, may finalize this case.',
    };
  }
  return { granted: true, dimension: 'assigned-participant', reason: 'Assigned Primary/Attending on this case.' };
}

/**
 * The real denormalization this dimension's server-side enforcement
 * depends on. Firestore security rules have no way to ask "does any
 * element of this array of objects satisfy this predicate" —
 * CaseParticipant.staffId/participationTypeIds live inside an array of
 * objects, and rules' array operators (in, hasAny, hasAll) only work
 * against flat value lists. This derives that flat list — the exact
 * same eligibility logic canFinalizeCase() above already uses for the
 * client-side check, reused rather than re-implemented, so the two can
 * never independently drift apart.
 *
 * Called automatically by CaseRouter.ts whenever a write includes
 * participants, not something every caller has to remember to invoke
 * — a "disciplined updates" requirement is exactly the kind of manual
 * invariant that's caused real bugs elsewhere in this app tonight
 * (the O26- prefix duplicated six times independently is the same
 * class of risk this sidesteps by making it structural instead).
 */
export function deriveEligibleFinalizerIds(
  participants: CaseFinalizeParticipant[] | null | undefined
): string[] {
  return (participants ?? [])
    .filter(p => p.status === 'active' && p.participationTypeIds.some(t => FINALIZE_ELIGIBLE_PARTICIPATION_TYPES.includes(t)))
    .map(p => p.staffId);
}

/**
 * Whether this session is permitted to see cross-tenant data specifically
 * in QA/compliance reporting views (see qaReportUtils.ts's QaScope
 * 'enterprise' level). Distinct from canAccessCase's superadmin bypass —
 * superadmin still qualifies (a platform admin can see everything), but
 * so does anyone explicitly granted canAccessCrossTenantQa without
 * needing full superadmin case-access privileges. Deny by default, same
 * principle as canAccessCase — no session, no role, no explicit grant
 * means no cross-tenant visibility, full stop.
 */
export function canViewCrossTenantQaData(session: SessionUser | null): boolean {
  if (!session) return false;
  return session.role === 'superadmin' || session.canAccessCrossTenantQa === true;
}

// ─────────────────────────────────────────────────────────────────────────
// resolvePediatricAccess() / resolveOrchestrationAccess() — real,
// centralized enforcement of the two sensitive-data restrictions that
// previously only existed as UI-level convenience checks scattered
// across WorklistTable.tsx (isPedRestricted) and WorklistPage.tsx
// (canViewCase), with neither wired into the actual case-loading path
// (synopticLoader.ts only ever checked that a case exists). Anyone
// navigating directly to a case URL, using a bookmark/shared link, or
// opening a case from Search bypassed both checks entirely. This file
// is the single place both the UI convenience checks and the real
// loader-level guard now call, so they can't independently drift again
// the way isPedRestricted/canViewCase already had (one had silently
// stopped reading a renamed field; the other used OR instead of the
// documented AND for the two-part pediatric gate).
//
// Pediatric logic: "Option C" dual gate per
// Facility.authorizedPediatricPathologistIds's own doc comment
// (IFacilityService.ts) — "Both this AND canViewPediatric on the user
// record must be true." Deliberately AND, not OR: a user-level flag
// alone doesn't authorize a specific facility's pediatric cases, and
// being on a facility's list alone doesn't override a missing
// user-level qualification.
//
// Deliberately no superadmin/admin bypass here, unlike resolveCaseAccess
// / canFinalizeCase above — this gate reflects a real clinical
// qualification (age-appropriate specialist review), not an
// organizational permission a platform or org admin should be able to
// wave through. Neither of the two prior UI-level implementations had
// a role-based bypass either; this preserves that, doesn't add one.
// ─────────────────────────────────────────────────────────────────────────

export interface CaseAccessFacility {
  id: string;
  pediatricAgeThreshold: number | null;
  authorizedPediatricPathologistIds: string[];
}

export type SensitiveAccessDecision =
  | { granted: true; dimension: 'no-restriction' | 'not-pediatric' | 'pediatric-authorized'; reason: string }
  | { granted: false; dimension: 'no-session' | 'pediatric-restricted' | 'orchestration-restricted'; reason: string };

export function resolvePediatricAccess(
  session: SessionUser | null,
  caseRecord: { order?: { facilityId?: string | null } | null; patient?: { dateOfBirth?: string | null } | null } | null | undefined,
  facility: CaseAccessFacility | null | undefined
): SensitiveAccessDecision {
  if (!session) return { granted: false, dimension: 'no-session', reason: 'No active session.' };

  const dob = caseRecord?.patient?.dateOfBirth;
  const threshold = facility?.pediatricAgeThreshold ?? null;
  if (!dob || threshold === null) {
    return { granted: true, dimension: 'no-restriction', reason: 'No pediatric threshold configured for this facility.' };
  }

  const ageYrs = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  if (ageYrs >= threshold) {
    return { granted: true, dimension: 'not-pediatric', reason: `Patient age ${ageYrs} is at or above this facility's pediatric threshold (${threshold}).` };
  }

  const hasFlag = session.canViewPediatric === true;
  const isAuthorized = (facility?.authorizedPediatricPathologistIds ?? []).includes(session.id);
  if (hasFlag && isAuthorized) {
    return { granted: true, dimension: 'pediatric-authorized', reason: 'User has canViewPediatric and is on this facility\'s authorized pediatric pathologist list.' };
  }

  return {
    granted: false,
    dimension: 'pediatric-restricted',
    reason: `Patient age ${ageYrs} is below this facility's pediatric threshold (${threshold}). ${!hasFlag ? 'User lacks canViewPediatric permission.' : 'User is not on this facility\'s authorized pediatric pathologist list.'}`,
  };
}

export function resolveOrchestrationAccess(
  session: SessionUser | null,
  caseRecord: { reportingMode?: string | null } | null | undefined
): SensitiveAccessDecision {
  if (!session) return { granted: false, dimension: 'no-session', reason: 'No active session.' };
  if (caseRecord?.reportingMode !== 'orchestrator') {
    return { granted: true, dimension: 'no-restriction', reason: 'Not an Orchestration case.' };
  }
  if (session.canViewOrchestration === true) {
    return { granted: true, dimension: 'no-restriction', reason: 'User has canViewOrchestration.' };
  }
  return { granted: false, dimension: 'orchestration-restricted', reason: 'User lacks canViewOrchestration permission for this Orchestration/Outreach case.' };
}

// DELETED (this pass): filterAccessibleCases() used to live here — same
// situation as canAccessCase() above, superseded by
// filterAccessibleCasesWithPools() below when CaseRouter.ts was
// refactored for dimension-3 enforcement, found genuinely orphaned by
// the same direct audit.

/**
 * Real dimension-3-aware equivalents of canAccessCase/filterAccessibleCases
 * above, for CaseRouter.ts — the single enforcement point every case-read
 * path already funnels through. Takes a pre-resolved subspecialty lookup
 * (subspecialtyId -> CaseAccessSubspecialty) rather than fetching it
 * itself, keeping this file free of a new services/subspecialties
 * dependency — the caller (CaseRouter.ts) already has async access to
 * fetch it once and reuse it across a whole batch of cases.
 */
export function canAccessCaseWithPools(
  session: SessionUser | null,
  caseRecord: { originHospitalId?: string | null; subspecialtyId?: string | null } | null | undefined,
  subspecialtiesById: Map<string, CaseAccessSubspecialty> | null | undefined,
  enterpriseFacilities: Facility[] = []
): boolean {
  const sub = caseRecord?.subspecialtyId ? subspecialtiesById?.get(caseRecord.subspecialtyId) : undefined;
  return resolveCaseAccess(session, caseRecord, sub ?? null, enterpriseFacilities).granted;
}

export function filterAccessibleCasesWithPools<T extends { originHospitalId?: string | null; subspecialtyId?: string | null }>(
  session: SessionUser | null,
  cases: T[],
  subspecialtiesById: Map<string, CaseAccessSubspecialty> | null | undefined,
  enterpriseFacilities: Facility[] = []
): T[] {
  return cases.filter(c => canAccessCaseWithPools(session, c, subspecialtiesById, enterpriseFacilities));
}

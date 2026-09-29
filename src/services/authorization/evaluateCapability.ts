// src/services/authorization/evaluateCapability.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): the permission check, `can(user, capability, context)`.
//
// Who holds what:
//   • A signed-in user holds the catalog roles named on their staff record
//     (StaffUser.roles, matched to the role catalog by name or id).
//   • A PathScribe support sign-in (session role 'superadmin') also holds the
//     built-in Superadmin role. That role is not assignable to staff, so a
//     staff record naming it is ignored.
//   • There is no bypass for anyone: Superadmin is allowed only what its
//     role grants, which is visible and editable in Staff → Roles.
//
// A capability is allowed when some held role grants it AND every
// capability it requires is granted too. The decision names the role(s)
// that granted it, which is what the audit entry records.
//
// Context (case, facility) is carried into the decision and the audit entry.
//
// Facility scope (PS-356, Batch 370; Pete: scope lives on the staff
// member's assignment, not the role). StaffUser.facilityIds lists the
// facilities someone works for; empty or absent means all of them. For
// someone limited to some facilities:
//   • an action on facility data outside their list is refused ('outOfScope');
//   • an action spanning all facilities (an enterprise- or organisation-wide
//     QA export) is refused ('outOfScope');
//   • a case action on a case with no facility recorded is refused
//     ('facilityUnknown'): deny when it can't be shown to be in scope.
// Actions with no facility dimension (managing roles) aren't affected. Scope
// never widens what the roles grant; it only narrows where.
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { NewAuditLog } from '../auditlog/IAuditService';
import { CAPABILITY_CATALOG, type CapabilityDefinition } from './capabilityCatalog';
import { requirementsOf } from './capabilityDependencies';
import { SYSTEM_ROLE_IDS } from '../roles/systemRoles';

/** Fixed id of the built-in Superadmin role. */
export const SUPERADMIN_ROLE_ID = SYSTEM_ROLE_IDS.SUPERADMIN;

export interface AuthzRole {
  id: string;
  name: string;
  capabilities?: readonly string[];
  /** false for roles staff can't be given (Superadmin). */
  assignable?: boolean;
}

export interface AuthzSubject {
  userId: string;
  userName: string;
  /** The session's app role ('superadmin' adds the Superadmin role). */
  sessionRole: string | null | undefined;
  /** StaffUser.roles: role names (or ids) from the staff record. */
  staffRoles: readonly string[];
  /** StaffUser.facilityIds: the facilities this person works for. Empty or absent: all. */
  facilityIds?: readonly string[];
}

export interface CapabilityContext {
  caseId?: string | null;
  /** The facility whose data the action touches (a case's facility). */
  facilityId?: string | null;
  /** Several facilities (a QA export for one client scope). */
  facilityIds?: readonly string[];
  /** The action spans every facility (an enterprise- or organisation-wide export). */
  allFacilities?: boolean;
}

export type CapabilityDenialReason = 'noUser' | 'unknownCapability' | 'notGranted' | 'requirementNotGranted' | 'outOfScope' | 'facilityUnknown';

export interface CapabilityDecision {
  capability: string;
  allowed: boolean;
  /** When denied. */
  reason?: CapabilityDenialReason;
  /** The held roles that grant the capability (empty when not granted). */
  grantedBy: { id: string; name: string }[];
  /** Requirements the user doesn't hold (reason 'requirementNotGranted'). */
  missingRequirements: string[];
  /** Facilities the action touches that the user's assignment doesn't cover ('all' for an all-facility action). */
  outsideFacilities?: string[];
  context: CapabilityContext;
}

/** The catalog roles a subject holds. */
export function heldRoles<R extends AuthzRole>(subject: AuthzSubject, catalogRoles: readonly R[]): R[] {
  const wanted = new Set(subject.staffRoles.map(r => r.trim().toLowerCase()).filter(Boolean));
  const held = catalogRoles.filter(r =>
    r.assignable !== false && (wanted.has(r.id.toLowerCase()) || wanted.has(r.name.trim().toLowerCase())));
  if (subject.sessionRole === 'superadmin') {
    const sa = catalogRoles.find(r => r.id === SUPERADMIN_ROLE_ID);
    if (sa && !held.includes(sa)) held.push(sa);
  }
  return held;
}

/** Every catalog capability the subject holds, requirements satisfied. */
export function grantedCapabilities(subject: AuthzSubject | null, catalogRoles: readonly AuthzRole[], catalog: readonly CapabilityDefinition[] = CAPABILITY_CATALOG): Set<string> {
  const out = new Set<string>();
  if (!subject) return out;
  for (const c of catalog) if (evaluateCapability(subject, c.key, catalogRoles, {}, catalog).allowed) out.add(c.key);
  return out;
}

export function evaluateCapability(
  subject: AuthzSubject | null,
  capability: string,
  catalogRoles: readonly AuthzRole[],
  context: CapabilityContext = {},
  catalog: readonly CapabilityDefinition[] = CAPABILITY_CATALOG,
): CapabilityDecision {
  const base = { capability, grantedBy: [] as { id: string; name: string }[], missingRequirements: [] as string[], context };
  if (!subject || !subject.userId) return { ...base, allowed: false, reason: 'noUser' };
  if (!catalog.some(c => c.key === capability)) return { ...base, allowed: false, reason: 'unknownCapability' };

  const roles = heldRoles(subject, catalogRoles);
  // Batch 371: a platform-only capability counts only from a role staff
  // can't be given (Superadmin), even if a hospital role somehow lists it.
  const platformOnly = (key: string) => !!catalog.find(c => c.key === key)?.platformOnly;
  const grants = (key: string) => roles.filter(r => (r.capabilities ?? []).includes(key) && (!platformOnly(key) || r.assignable === false));
  const grantedBy = grants(capability).map(r => ({ id: r.id, name: r.name }));
  if (grantedBy.length === 0) return { ...base, allowed: false, reason: 'notGranted' };

  const missingRequirements = requirementsOf(capability, catalog).filter(r => grants(r).length === 0);
  if (missingRequirements.length > 0) return { ...base, grantedBy, missingRequirements, allowed: false, reason: 'requirementNotGranted' };

  const scope = facilityScopeProblem(subject.facilityIds ?? [], context);
  if (scope) return { ...base, grantedBy, allowed: false, ...scope };

  return { ...base, grantedBy, allowed: true };
}

/** Why an action falls outside a facility assignment, or null when it doesn't. */
export function facilityScopeProblem(
  assigned: readonly string[],
  context: CapabilityContext,
): { reason: 'outOfScope' | 'facilityUnknown'; outsideFacilities: string[] } | null {
  if (assigned.length === 0) return null;                 // all facilities
  if (context.allFacilities) return { reason: 'outOfScope', outsideFacilities: ['all'] };
  const touched = [...new Set([...(context.facilityId ? [context.facilityId] : []), ...(context.facilityIds ?? [])])];
  if (touched.length === 0) return context.caseId ? { reason: 'facilityUnknown', outsideFacilities: [] } : null;
  const outside = touched.filter(f => !assigned.includes(f));
  return outside.length ? { reason: 'outOfScope', outsideFacilities: outside } : null;
}

/**
 * The audit entry for a check made at an action. Detail stays literal
 * English (audit records are compliance artifacts, not UI) and names the
 * capability and the role that allowed it, or why it was refused.
 */
export function capabilityAuditEntry(subject: AuthzSubject | null, decision: CapabilityDecision): NewAuditLog {
  const roles = decision.grantedBy.map(r => `"${r.name}" (${r.id})`).join(', ');
  const why = decision.allowed
    ? `allowed by role ${roles}`
    : decision.reason === 'requirementNotGranted'
      ? `refused: granted by role ${roles} but requires ${decision.missingRequirements.join(', ')}, which no role held grants`
      : decision.reason === 'notGranted'
        ? 'refused: no role held grants it'
        : decision.reason === 'unknownCapability'
          ? 'refused: not in the capability catalog'
          : decision.reason === 'outOfScope'
            ? `refused: granted by role ${roles} but outside the user's facility assignment (${(decision.outsideFacilities ?? []).join(', ') === 'all' ? 'the action spans all facilities' : (decision.outsideFacilities ?? []).join(', ')})`
            : decision.reason === 'facilityUnknown'
              ? `refused: granted by role ${roles} but the case has no facility recorded, and the user's facility assignment is limited`
              : 'refused: no signed-in user';
  const touched = [...(decision.context.facilityId ? [decision.context.facilityId] : []), ...(decision.context.facilityIds ?? [])];
  const where = decision.context.allFacilities ? ' Facilities: all.' : touched.length ? ` Facility: ${touched.join(', ')}.` : '';
  return {
    type: 'user',
    event: decision.allowed ? 'Capability allowed' : 'Capability refused',
    detail: `${decision.capability} ${why}. Session role: ${subject?.sessionRole ?? 'none'}.${where}`,
    user: subject?.userName ?? 'unknown',
    caseId: decision.context.caseId ?? null,
    confidence: null,
    facilityId: decision.context.facilityId ?? (decision.context.facilityIds?.length === 1 ? decision.context.facilityIds[0] : null),
  };
}

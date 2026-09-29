// src/services/roles/roleAdministration.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-356 (Batch 370): saving a role, the only way screens change roles.
//
// Before this, any signed-in user could open Staff → Roles and save any
// role, their own capabilities included: a pathologist could give
// themselves the QA exports. Now:
//   • saving needs `config:roles:manage` (checked and audited);
//   • the capability list must be consistent (roleCapabilityProblem);
//   • a save may not leave the site with no assignable role that can
//     manage roles (the lockout guard; Superadmin doesn't count, since a
//     hospital can't give it to anyone);
//   • a change to capabilities writes "Role capabilities changed".
//
// Deps are passed in so this is testable without module mocks.
// ─────────────────────────────────────────────────────────────────────────────

import type { IAuditService } from '../auditlog/IAuditService';
import type { IRoleService, Role } from './IRoleService';
import type { IAuthorizationService } from '../authorization/authorizationService';
import { roleCapabilityChangeAudit, roleCapabilityProblem } from '../authorization/roleCapabilityRules';

export const ROLE_MANAGE_CAPABILITY = 'config:roles:manage';

export type RoleDraft = Omit<Role, 'id'>;

export type SaveRoleResult =
  | { ok: true; role: Role }
  | { ok: false; reason: 'notPermitted' | 'invalidCapabilities' | 'lastRoleManager' | 'notFound' | 'platformRole' | 'error'; detail?: string };

export interface RoleAdministrationDeps {
  roleService: Pick<IRoleService, 'getAll' | 'add' | 'update'>;
  authorization: Pick<IAuthorizationService, 'enforce'>;
  auditService: Pick<IAuditService, 'logEvent'>;
  actorName: string;
}

/** Whether a catalog still has an assignable role that can manage roles. Pure. */
export function keepsARoleManager(roles: readonly Pick<Role, 'id' | 'capabilities' | 'assignable'>[]): boolean {
  return roles.some(r => r.assignable !== false && (r.capabilities ?? []).includes(ROLE_MANAGE_CAPABILITY));
}

export async function saveRole(
  input: { mode: 'add'; draft: RoleDraft } | { mode: 'edit'; id: string; draft: RoleDraft },
  deps: RoleAdministrationDeps,
): Promise<SaveRoleResult> {
  const decision = await deps.authorization.enforce('config:roles:manage');
  if (!decision.allowed) return { ok: false, reason: 'notPermitted' };

  const all = await deps.roleService.getAll();
  if (all.ok === false) return { ok: false, reason: 'error', detail: all.error };
  const before = input.mode === 'edit' ? all.data.find(r => r.id === input.id) : undefined;
  if (input.mode === 'edit' && !before) return { ok: false, reason: 'notFound' };
  // Batch 371 (Pete): a hospital has no control over Superadmin, whatever
  // capabilities its administrators hold.
  if (before?.assignable === false) return { ok: false, reason: 'platformRole' };

  // A new or edited role here is always a hospital (assignable) role.
  const problem = roleCapabilityProblem(input.draft.capabilities ?? [], { assignable: true });
  if (problem) return { ok: false, reason: 'invalidCapabilities', detail: problem };

  if (input.mode === 'edit') {
    const after = all.data.map(r => (r.id === input.id ? { ...r, ...input.draft } : r));
    if (!keepsARoleManager(after)) return { ok: false, reason: 'lastRoleManager' };
  }

  // A new role is always an ordinary, assignable custom role.
  const res = input.mode === 'add'
    ? await deps.roleService.add({ ...input.draft, builtIn: false, assignable: undefined, seededCapabilities: undefined })
    : await deps.roleService.update(input.id, input.draft);
  if (res.ok === false) return { ok: false, reason: 'error', detail: res.error };

  const entry = roleCapabilityChangeAudit(input.draft.name, before?.capabilities ?? [], input.draft.capabilities, deps.actorName);
  if (entry) await deps.auditService.logEvent(entry);
  return { ok: true, role: res.data };
}

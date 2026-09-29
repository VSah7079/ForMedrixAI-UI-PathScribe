// src/services/staff/staffAdministration.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-356 (Batch 370): saving a staff record, the only way screens change
// staff. Per Pete, split in two:
//
//   config:staff:edit           the record itself: name, contact, license,
//                               voice and spelling preferences, signature,
//                               OR PIN, active/inactive.
//   config:staff-access:assign  what the person may do or see: roles,
//                               facility assignment, pediatric,
//                               orchestration and cross-tenant QA access,
//                               jurisdictional credentials. It requires
//                               config:staff:edit.
//
// Before this, anyone signed in could give any staff record, their own
// included, any role. Every save is checked here (and the check audited);
// an access change also writes "Staff access changed", and a credential
// change "Staff credentials changed", as before.
// ─────────────────────────────────────────────────────────────────────────────

import type { IAuditService } from '../auditlog/IAuditService';
import type { IAuthorizationService } from '../authorization/authorizationService';
import type { IUserService, StaffUser } from '../users/IUserService';
import { providerCredentialChangeDetail } from './providerCredentialRules';

export const STAFF_EDIT_CAPABILITY = 'config:staff:edit';
export const STAFF_ACCESS_CAPABILITY = 'config:staff-access:assign';

/** The fields that decide what someone may do or see. */
export const STAFF_ACCESS_FIELDS = [
  'roles', 'facilityIds', 'canViewPediatric', 'canViewOrchestration', 'canAccessCrossTenantQa', 'providerCredentials',
] as const;
type AccessField = (typeof STAFF_ACCESS_FIELDS)[number];

type StaffDraft = Omit<StaffUser, 'id'>;

const norm = (field: AccessField, v: unknown): string => {
  if (field === 'roles' || field === 'facilityIds') return JSON.stringify([...((v as string[] | undefined) ?? [])].map(s => s.trim()).sort());
  if (field === 'providerCredentials') return JSON.stringify(v ?? []);
  return String(!!v);
};

/** The access fields a save changes. A new record counts as changing every access field it sets. Pure. */
export function staffAccessChanges(before: Partial<StaffUser> | undefined, after: Partial<StaffUser>): AccessField[] {
  return STAFF_ACCESS_FIELDS.filter(f => f in after && norm(f, before?.[f]) !== norm(f, after[f]));
}

const list = (v: string[] | undefined, allLabel: string) => (v && v.length ? v.join(', ') : allLabel);
const flag = (v: boolean | undefined) => (v ? 'on' : 'off');

/** Audit detail for an access change (roles, facilities, flags), literal English. Credentials have their own entry. Pure. */
export function staffAccessChangeDetail(name: string, before: Partial<StaffUser> | undefined, after: Partial<StaffUser>): string | null {
  const parts = staffAccessChanges(before, after).filter(f => f !== 'providerCredentials').map(f => {
    switch (f) {
      case 'roles': return `roles ${list(before?.roles, 'none')} → ${list(after.roles, 'none')}`;
      case 'facilityIds': return `facilities ${list(before?.facilityIds, 'all')} → ${list(after.facilityIds, 'all')}`;
      case 'canViewPediatric': return `pediatric access ${flag(before?.canViewPediatric)} → ${flag(after.canViewPediatric)}`;
      case 'canViewOrchestration': return `orchestration access ${flag(before?.canViewOrchestration)} → ${flag(after.canViewOrchestration)}`;
      default: return `cross-tenant QA ${flag(before?.canAccessCrossTenantQa)} → ${flag(after.canAccessCrossTenantQa)}`;
    }
  });
  return parts.length ? `Staff "${name}": ${parts.join('; ')}.` : null;
}

export type SaveStaffResult =
  | { ok: true; user: StaffUser }
  | { ok: false; reason: 'notPermitted'; capability: string }
  | { ok: false; reason: 'error'; detail: string };

export interface StaffAdministrationDeps {
  userService: Pick<IUserService, 'add' | 'update'>;
  authorization: Pick<IAuthorizationService, 'enforce'>;
  auditService: Pick<IAuditService, 'logEvent'>;
  actorName: string;
}

export async function saveStaffMember(
  input: { mode: 'add'; draft: StaffDraft } | { mode: 'edit'; before: StaffUser; draft: StaffDraft },
  deps: StaffAdministrationDeps,
): Promise<SaveStaffResult> {
  const before = input.mode === 'edit' ? input.before : undefined;
  const edit = await deps.authorization.enforce('config:staff:edit');
  if (!edit.allowed) return { ok: false, reason: 'notPermitted', capability: STAFF_EDIT_CAPABILITY };

  const accessChanged = staffAccessChanges(before, input.draft).length > 0;
  if (accessChanged) {
    const access = await deps.authorization.enforce('config:staff-access:assign');
    if (!access.allowed) return { ok: false, reason: 'notPermitted', capability: STAFF_ACCESS_CAPABILITY };
  }

  const res = input.mode === 'add' ? await deps.userService.add(input.draft) : await deps.userService.update(input.before.id, input.draft);
  if (res.ok === false) return { ok: false, reason: 'error', detail: res.error };

  const name = [input.draft.firstName, input.draft.lastName].filter(Boolean).join(' ');
  const access = staffAccessChangeDetail(name, before, input.draft);
  if (access) await deps.auditService.logEvent({ type: 'user', event: 'Staff access changed', detail: access, user: deps.actorName, caseId: null, confidence: null });
  const credentials = providerCredentialChangeDetail(name, before?.providerCredentials, input.draft.providerCredentials ?? []);
  if (credentials) await deps.auditService.logEvent({ type: 'user', event: 'Staff credentials changed', detail: credentials, user: deps.actorName, caseId: null, confidence: null });
  return { ok: true, user: res.data };
}

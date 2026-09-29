// src/services/auth/sessionRole.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): the app role and session profile for someone signing
// in with SSO. The demo accounts carry their role in the account table;
// an SSO user's role comes from their staff record's roles, looked up in
// the role catalogue (System → Roles):
//
//   a role with case access and one with configuration access → pathologist-admin
//   case access only                                          → pathologist
//   configuration access only                                 → admin
//   neither (Physician, OR Staff: directory entries)          → no app access
//
// 'superadmin' (PathScribe platform support) is never derived from a
// hospital's own staff directory. The API server decides it for
// PathScribe's own staff.
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { Role } from '../roles/IRoleService';
import type { StaffUser } from '../users/IUserService';
import type { SsoProviderId } from './authConfig';
import { staffSessionFields, type AppRole, type SessionProfile } from './sessionProfile';
import type { VoiceProfileId } from '../../constants/voiceProfiles';
import { safeInternalPath } from '@/utils/safeInternalPath';

export type SsoAppRole = Exclude<AppRole, 'superadmin'>;

/** The app role for these staff roles (names or ids), or null for no app access. */
export function deriveSessionRole(
  staffRoles: readonly string[] | undefined,
  catalogue: readonly Pick<Role, 'id' | 'name' | 'caseAccess' | 'configAccess' | 'assignable'>[],
): SsoAppRole | null {
  const wanted = new Set((staffRoles ?? []).map(r => r.trim().toLowerCase()).filter(Boolean));
  // A role staff can't be given (Superadmin, PS-355) counts for nothing even
  // if a staff record names it.
  const held = catalogue.filter(r => r.assignable !== false && (wanted.has(r.id.toLowerCase()) || wanted.has(r.name.trim().toLowerCase())));
  const clinical = held.some(r => r.caseAccess);
  const admin = held.some(r => r.configAccess);
  if (clinical && admin) return 'pathologist-admin';
  if (clinical) return 'pathologist';
  if (admin) return 'admin';
  return null;
}

const initialsOf = (first: string, last: string) =>
  `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || '?';

/** The session profile for an SSO sign-in as this staff member. */
export function buildSsoSessionProfile(staff: StaffUser, role: SsoAppRole, providerId: SsoProviderId): SessionProfile {
  const first = staff.firstName ?? '';
  const last = staff.lastName ?? '';
  return {
    id: staff.id,
    name: [first, last].map(s => s.trim()).filter(Boolean).join(' ') || staff.email,
    email: staff.email,
    role,
    initials: initialsOf(first, last),
    voiceProfile: (staff.voiceProfile ?? 'EN-US') as VoiceProfileId,
    ...staffSessionFields(staff),
    authMethod: 'sso',
    ssoProviderId: providerId,
  };
}

const AUTH_PATHS = /^\/(login|auth)(\/|$|\?|#)/;

/**
 * Where to go after signing in: the page the user was trying to open, if it
 * is a PathScribe path and not the sign-in pages themselves; otherwise home.
 * The target round-trips through the identity provider, so it is checked
 * like any other untrusted navigation target.
 */
export function resolvePostSignInPath(target: unknown): string {
  const path = safeInternalPath(target);
  if (!path || AUTH_PATHS.test(path)) return '/';
  return path;
}

// src/services/auth/sessionProfile.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): the signed-in user's session profile, and where it is
// kept. AuthContext re-exports SessionProfile as `User`, so the ~60 screens
// that call useAuth() are unchanged.
//
// The profile is stored under the same browser key as before
// ('pathscribe-user'), so getSessionUser() in caseAccessControl.ts, the
// scan-station fallback and existing tests keep reading it. It moved here
// from AuthContext so the UI layer no longer touches browser storage.
//
// The profile is a display and routing convenience. It is not proof of
// identity: with SSO, the API server decides who the caller is from the
// bearer token on every request (docs/architecture/AUTHENTICATION_OIDC.md).
// ─────────────────────────────────────────────────────────────────────────────

import type { VoiceProfileId } from '../../constants/voiceProfiles';
import type { StaffUser } from '../users/IUserService';

export type AppRole = 'pathologist' | 'admin' | 'pathologist-admin' | 'superadmin';

/** How this session was signed in. */
export type AuthMethod = 'password' | 'sso';

export interface SessionProfile {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  initials: string;
  voiceProfile: VoiceProfileId;
  // Signature-block fields, resolved from the StaffUser record at sign-in.
  credentials?: string;
  signatureUrl?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  canViewPediatric?: boolean;
  canViewOrchestration?: boolean;
  /** Cross-tenant QA/compliance reporting (StaffUser.canAccessCrossTenantQa). */
  canAccessCrossTenantQa?: boolean;
  /** The tenant boundary (StaffUser.organisationId); read by caseAccessControl.ts. */
  organisationId?: string;
  /** The user's home scan station (StaffUser.defaultScanStationId). */
  defaultScanStationId?: string;
  /** PS-60. Absent on sessions stored before Batch 343, which were all password sign-ins. */
  authMethod?: AuthMethod;
  /** PS-60. The SSO provider this session came from ('microsoft', 'oidc'). */
  ssoProviderId?: string;
  /** PS-60 (Batch 344). The SSO account this session belongs to (token
   *  issuer + permanent account id), so a signature confirmation can
   *  check the same person signed in again. */
  ssoIssuer?: string;
  ssoSubject?: string;
}

export const SESSION_PROFILE_STORAGE_KEY = 'pathscribe-user';

/** The stored profile, or null when there is none or it can't be read. */
export function readSessionProfile(): SessionProfile | null {
  try {
    const raw = localStorage.getItem(SESSION_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.id === 'string' && parsed.id ? parsed as SessionProfile : null;
  } catch {
    return null;
  }
}

/** Stores the profile, or removes it when given null. */
export function writeSessionProfile(profile: SessionProfile | null): void {
  try {
    if (profile) localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(SESSION_PROFILE_STORAGE_KEY);
  } catch { /* storage unavailable: the session lives in memory only */ }
}

/** The StaffUser fields a session carries (signature block, access flags, tenant). */
export type StaffSessionFields = Pick<SessionProfile,
  'canViewPediatric' | 'canViewOrchestration' | 'canAccessCrossTenantQa' | 'credentials' | 'signatureUrl'
  | 'firstName' | 'middleName' | 'lastName' | 'organisationId' | 'defaultScanStationId'>;

/**
 * The session fields for a staff record. With no record, the access flags
 * are false and there is no organisation, which means no case access:
 * deny by default, never fall back to a default tenant.
 */
export function staffSessionFields(staff: StaffUser | null | undefined): StaffSessionFields {
  if (!staff) return { canViewPediatric: false, canViewOrchestration: false, canAccessCrossTenantQa: false };
  return {
    canViewPediatric:       staff.canViewPediatric ?? false,
    canViewOrchestration:   staff.canViewOrchestration ?? false,
    canAccessCrossTenantQa: staff.canAccessCrossTenantQa ?? false,
    credentials:            staff.credentials ?? undefined,
    signatureUrl:           staff.signatureUrl ?? undefined,
    firstName:              staff.firstName ?? undefined,
    middleName:             staff.middleName ?? undefined,
    lastName:               staff.lastName ?? undefined,
    organisationId:         staff.organisationId ?? undefined,
    defaultScanStationId:   staff.defaultScanStationId ?? undefined,
  };
}

/** True when a stored profile predates one of the staff-derived fields and needs them filled in. */
export function profileNeedsStaffFields(profile: SessionProfile): boolean {
  return profile.canViewPediatric === undefined || profile.canViewOrchestration === undefined
    || profile.canAccessCrossTenantQa === undefined || profile.organisationId === undefined;
}

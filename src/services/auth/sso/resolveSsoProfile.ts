// src/services/auth/sso/resolveSsoProfile.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): after the identity provider has said who someone is,
// who are they in PathScribe? Two ways, chosen by authSession.ts:
//
//   • API server (VITE_API_BASE_URL set): GET /api/me with the access token.
//     The server validates the token, applies the linking rule and returns
//     the session profile, or 403 with the reason. This is the production
//     path: only the server can be trusted to decide.
//   • Local (no API server yet: development and demos): the same rule
//     (externalIdentity.ts) against the demo staff directory and role
//     catalogue, storing a new link on the staff record and auditing it.
// ─────────────────────────────────────────────────────────────────────────────

import type { IUserService } from '../../users/IUserService';
import type { IRoleService } from '../../roles/IRoleService';
import type { IAuditService } from '../../auditlog/IAuditService';
import type { SsoProviderConfig } from '../authConfig';
import { identityFromClaims, isSsoDenialReason, matchStaffToIdentity, type SsoDenialReason } from '../externalIdentity';
import { buildSsoSessionProfile, deriveSessionRole } from '../sessionRole';
import type { AppRole, SessionProfile } from '../sessionProfile';

export type SsoProfileResult =
  | { ok: true; profile: SessionProfile }
  | { ok: false; reason: SsoDenialReason; detail?: string };

/** Audit wording for each provider (audit detail stays in English). */
export const SSO_PROVIDER_AUDIT_NAMES: Record<SsoProviderConfig['id'], string> = {
  microsoft: 'Microsoft Entra ID',
  google: 'Google',
  oidc: 'the organisation’s identity provider',
};

export interface LocalResolveDeps {
  userService: Pick<IUserService, 'getAll' | 'update'>;
  roleService: Pick<IRoleService, 'getAll'>;
  auditService: Pick<IAuditService, 'logEvent'>;
  now: () => Date;
}

export async function resolveSsoProfileLocally(
  provider: SsoProviderConfig,
  claims: Record<string, unknown>,
  deps: LocalResolveDeps,
): Promise<SsoProfileResult> {
  const providerName = SSO_PROVIDER_AUDIT_NAMES[provider.id];
  const identity = identityFromClaims(provider, claims);
  if (!identity) return { ok: false, reason: 'invalid_token', detail: 'the ID token names no account' };

  const refuse = async (reason: SsoDenialReason): Promise<SsoProfileResult> => {
    await deps.auditService.logEvent({
      type: 'user', event: 'SSO sign-in refused',
      detail: `Sign-in with ${providerName} refused (${reason}).`,
      user: identity.email ?? 'Unknown account', caseId: null, confidence: null,
    }).catch(() => {});
    return { ok: false, reason };
  };

  const [staffRes, rolesRes] = await Promise.all([deps.userService.getAll(), deps.roleService.getAll()]);
  if (staffRes.ok === false || rolesRes.ok === false) return { ok: false, reason: 'server_unavailable' };

  const match = matchStaffToIdentity(identity, staffRes.data, { linkByEmail: provider.linkByEmail, now: deps.now() });
  if (match.ok === false) return refuse(match.reason);

  const staff = staffRes.data.find(s => s.id === match.staffId)!;
  const role = deriveSessionRole(staff.roles, rolesRes.data);
  if (!role) return refuse('no_app_access');

  if (match.newLink) {
    const saved = await deps.userService.update(staff.id, { externalIdentities: [...(staff.externalIdentities ?? []), match.newLink] });
    if (saved.ok === false) return { ok: false, reason: 'server_unavailable' };
    await deps.auditService.logEvent({
      type: 'user', event: 'SSO account linked',
      detail: `Account at ${providerName} linked to staff record ${staff.id} at first sign-in, matched by email.`,
      user: `${staff.firstName} ${staff.lastName}`.trim(), caseId: null, confidence: null,
    }).catch(() => {});
  }

  return { ok: true, profile: buildSsoSessionProfile(staff, role, provider.id) };
}

const APP_ROLES: readonly AppRole[] = ['pathologist', 'admin', 'pathologist-admin', 'superadmin'];

/** Checks the profile the API server returned; null if it isn't one. */
export function parseApiProfile(body: unknown, providerId: SsoProviderConfig['id']): SessionProfile | null {
  const p = body && typeof body === 'object' ? (body as { profile?: unknown }).profile : null;
  if (!p || typeof p !== 'object') return null;
  const r = p as Record<string, unknown>;
  const text = (k: string) => (typeof r[k] === 'string' ? r[k] as string : '');
  if (!text('id') || !text('name') || !APP_ROLES.includes(r.role as AppRole)) return null;
  return {
    ...(r as unknown as SessionProfile),
    email: text('email'),
    initials: text('initials') || text('name').charAt(0).toUpperCase(),
    voiceProfile: (text('voiceProfile') || 'EN-US') as SessionProfile['voiceProfile'],
    authMethod: 'sso',
    ssoProviderId: providerId,
  };
}

export interface ApiResolveDeps {
  apiBaseUrl: string;
  accessToken: string | null;
  fetch?: typeof fetch;
}

export async function resolveSsoProfileFromApi(provider: SsoProviderConfig, deps: ApiResolveDeps): Promise<SsoProfileResult> {
  if (!deps.accessToken) return { ok: false, reason: 'invalid_token', detail: 'no access token' };
  const doFetch = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${deps.apiBaseUrl.replace(/\/+$/, '')}/api/me`, {
      headers: { Authorization: `Bearer ${deps.accessToken}`, Accept: 'application/json' },
    });
  } catch (e) {
    return { ok: false, reason: 'server_unavailable', detail: e instanceof Error ? e.message : String(e) };
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) return { ok: false, reason: 'invalid_token' };
  if (res.status === 403) {
    const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : undefined;
    return { ok: false, reason: isSsoDenialReason(reason) ? reason : 'not_provisioned' };
  }
  if (!res.ok) return { ok: false, reason: 'server_unavailable', detail: `HTTP ${res.status}` };
  const profile = parseApiProfile(body, provider.id);
  return profile ? { ok: true, profile } : { ok: false, reason: 'server_unavailable', detail: 'unexpected /api/me response' };
}

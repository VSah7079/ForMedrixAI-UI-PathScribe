// src/services/auth/authConfig.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): how people sign in to this deployment, read from the
// build's VITE_AUTH_* settings. Pure: the caller passes the settings and
// whether this is a production build.
//
//   VITE_AUTH_MODE            demo (default) → email + password against the
//                                               demo accounts, plus any SSO
//                                               providers configured below
//                             sso            → SSO only. The demo accounts
//                                               are left out of the bundle.
//
//   One block per SSO provider (<ID> = MICROSOFT, GOOGLE or OIDC):
//   VITE_AUTH_<ID>_AUTHORITY      the provider's issuer URL (https)
//   VITE_AUTH_<ID>_CLIENT_ID      this app's registration (a public client:
//                                 no secret; PKCE protects the code)
//   VITE_AUTH_<ID>_API_SCOPE      optional: the PathScribe API's scope, so
//                                 the access token is for the API
//   VITE_AUTH_<ID>_SCOPES         optional: replaces the default
//                                 "openid profile email offline_access"
//   VITE_AUTH_<ID>_LINK_BY_EMAIL  optional, default true: on first sign-in,
//                                 link the identity to the one active staff
//                                 record with that email (externalIdentity.ts)
//
// Rules, each reported in `problems` (plain English, for the console):
//   • Authority must be https://; plain http only to this machine, and
//     only in a development build.
//   • Microsoft: the authority must name the hospital's own tenant.
//     /common, /organizations and /consumers let any Microsoft account
//     sign in, and the issuer then can't be checked.
//   • Google: not offered from the browser. Google's token endpoint needs
//     the client secret for web apps, so the code exchange has to happen on
//     the API server (or federate Google through Entra ID or Okta).
//   • sso mode with no usable provider: nobody could sign in, so it's
//     reported; the login page says sign-in isn't configured.
// ─────────────────────────────────────────────────────────────────────────────

import { isHttpsUrl, isLoopbackHttpUrl } from '@/utils/serviceEndpoint';

export type AuthMode = 'demo' | 'sso';

export const SSO_PROVIDER_IDS = ['microsoft', 'google', 'oidc'] as const;
export type SsoProviderId = typeof SSO_PROVIDER_IDS[number];

export interface SsoProviderConfig {
  id: SsoProviderId;
  authority: string;
  clientId: string;
  /** Space-separated scopes requested at sign-in. */
  scope: string;
  /** Link a first-time identity to staff by email (see externalIdentity.ts). */
  linkByEmail: boolean;
  /** The email claim comes from the organisation's own directory and needs no email_verified. */
  trustEmailClaim: boolean;
}

export interface AuthConfig {
  mode: AuthMode;
  /** Email + password sign-in (demo accounts) is offered. */
  passwordSignIn: boolean;
  providers: SsoProviderConfig[];
  problems: string[];
}

export const DEFAULT_SSO_SCOPES = 'openid profile email offline_access';

const MICROSOFT_SHARED_TENANTS = new Set(['common', 'organizations', 'consumers']);

type Env = Record<string, string | undefined>;

const setting = (env: Env, name: string) => (env[name] ?? '').trim();

function authorityProblem(id: SsoProviderId, authority: string, isProduction: boolean): string | null {
  const envVar = `VITE_AUTH_${id.toUpperCase()}_AUTHORITY`;
  if (isHttpsUrl(authority)) return null;
  if (!isProduction && isLoopbackHttpUrl(authority)) return null;
  return `${envVar} must be an https:// URL${isProduction ? '' : ' (or http:// to this machine in development)'}; "${authority}" was refused.`;
}

/** The tenant segment of a login.microsoftonline.com authority, or null for another host. */
export function microsoftTenantOf(authority: string): string | null {
  try {
    const u = new URL(authority);
    if (!/(^|\.)login\.microsoftonline\.(com|us)$/i.test(u.hostname) && !/(^|\.)ciamlogin\.com$/i.test(u.hostname)) return null;
    return u.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
  } catch {
    return null;
  }
}

function resolveProvider(env: Env, id: SsoProviderId, isProduction: boolean, problems: string[]): SsoProviderConfig | null {
  const prefix = `VITE_AUTH_${id.toUpperCase()}_`;
  const authority = setting(env, `${prefix}AUTHORITY`).replace(/\/+$/, '');
  const clientId = setting(env, `${prefix}CLIENT_ID`);
  if (!authority && !clientId) return null; // not configured: not offered

  if (!authority || !clientId) {
    problems.push(`${prefix}AUTHORITY and ${prefix}CLIENT_ID must both be set; ${id} sign-in is not offered.`);
    return null;
  }
  const bad = authorityProblem(id, authority, isProduction);
  if (bad) { problems.push(`${bad} ${id} sign-in is not offered.`); return null; }

  if (id === 'google') {
    problems.push('Google sign-in needs the PathScribe API server to exchange the code, because Google requires the client secret for web apps. It is not offered from the browser. Federate Google through Entra ID or Okta, or add the server exchange (docs/architecture/AUTHENTICATION_OIDC.md).');
    return null;
  }

  let trustEmailClaim = false;
  if (id === 'microsoft') {
    const tenant = microsoftTenantOf(authority);
    if (!tenant) {
      problems.push(`${prefix}AUTHORITY must be https://login.microsoftonline.com/<your tenant id>/v2.0; microsoft sign-in is not offered.`);
      return null;
    }
    if (MICROSOFT_SHARED_TENANTS.has(tenant)) {
      problems.push(`${prefix}AUTHORITY uses the shared "/${tenant}" endpoint, which lets any Microsoft account sign in. Use your organisation's tenant id; microsoft sign-in is not offered.`);
      return null;
    }
    // A tenant-specific Entra ID authority: the email comes from the
    // hospital's own directory, which its administrators control.
    trustEmailClaim = true;
  }

  const apiScope = setting(env, `${prefix}API_SCOPE`);
  const baseScopes = setting(env, `${prefix}SCOPES`) || DEFAULT_SSO_SCOPES;
  const scopes = baseScopes.split(/\s+/).filter(Boolean);
  if (!scopes.includes('openid')) scopes.unshift('openid');
  if (apiScope && !scopes.includes(apiScope)) scopes.push(apiScope);

  const linkSetting = setting(env, `${prefix}LINK_BY_EMAIL`).toLowerCase();
  return {
    id,
    authority,
    clientId,
    scope: scopes.join(' '),
    linkByEmail: linkSetting !== 'false',
    trustEmailClaim,
  };
}

export function resolveAuthConfig(env: Env, isProduction: boolean): AuthConfig {
  const problems: string[] = [];
  const rawMode = setting(env, 'VITE_AUTH_MODE').toLowerCase();
  let mode: AuthMode;
  if (rawMode === '' || rawMode === 'demo') mode = 'demo';
  else if (rawMode === 'sso') mode = 'sso';
  else {
    // Fail closed: an unrecognised mode never turns password sign-in on.
    problems.push(`VITE_AUTH_MODE "${rawMode}" is not recognised (use "demo" or "sso"); treating it as "sso".`);
    mode = 'sso';
  }

  const providers = SSO_PROVIDER_IDS
    .map(id => resolveProvider(env, id, isProduction, problems))
    .filter((p): p is SsoProviderConfig => p !== null);

  if (mode === 'sso' && providers.length === 0) {
    problems.push('VITE_AUTH_MODE is "sso" but no SSO provider is configured, so nobody can sign in.');
  }

  return { mode, passwordSignIn: mode === 'demo', providers, problems };
}

/** The provider with this id, if it is offered. */
export function findProvider(config: AuthConfig, id: string | undefined | null): SsoProviderConfig | null {
  return config.providers.find(p => p.id === id) ?? null;
}

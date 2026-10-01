// src/services/auth/externalIdentity.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): which staff member an SSO identity belongs to.
//
// The rule, from the PS-60 requirements: SSO only lets in staff who are
// already provisioned and active. Nobody is created by signing in.
//
//   1. A staff record already linked to this identity (issuer + subject)
//      → that person, if Active. The subject is the provider's permanent
//      id for the account: Entra ID's object id (oid), otherwise `sub`.
//      Email is never the key, because emails get reassigned.
//   2. Not linked yet, and the provider allows linking by email → the one
//      Active staff record with that email, if the email can be trusted
//      (email_verified, or the hospital's own Entra ID tenant). The link is
//      then stored, so from now on step 1 applies and a later email change
//      doesn't matter.
//   3. Refusals: no match (not_provisioned), only inactive matches
//      (inactive), more than one match (ambiguous), or the matching staff
//      record is already linked to a different account at the same
//      provider (already_linked: stops a reassigned mailbox taking over
//      someone's record).
//
// Pure. The API server applies the same rule for real; this copy runs
// when the app uses the local demo services (docs/architecture/AUTHENTICATION_OIDC.md).
// ─────────────────────────────────────────────────────────────────────────────

import type { StaffUser } from '../users/IUserService';
import type { SsoProviderConfig, SsoProviderId } from './authConfig';

/** A stored link between a staff record and an SSO account. */
export interface ExternalIdentityLink {
  providerId: SsoProviderId;
  /** The token issuer (`iss`). */
  issuer: string;
  /** The provider's permanent account id (Entra `oid`, otherwise `sub`). */
  subject: string;
  linkedAt: string;
  /** 'scim' (Batch 345): pushed by the hospital's directory (AUTHENTICATION_OIDC.md §6). */
  linkedBy: 'first-sign-in' | 'admin' | 'scim';
}

/** The parts of a verified sign-in that matter for matching. */
export interface ExternalIdentity {
  providerId: SsoProviderId;
  issuer: string;
  subject: string;
  /** Lower-cased email, or null. */
  email: string | null;
  /** The email can be used to link a first sign-in. */
  emailTrusted: boolean;
}

/** Why a sign-in was refused. Each has a login.ssoError.<reason> message. */
export const SSO_DENIAL_REASONS = [
  'not_provisioned', 'inactive', 'ambiguous', 'already_linked', 'no_app_access',
  'invalid_token', 'provider_error', 'cancelled', 'not_configured', 'server_unavailable',
] as const;
export type SsoDenialReason = typeof SSO_DENIAL_REASONS[number];

export function isSsoDenialReason(value: unknown): value is SsoDenialReason {
  return typeof value === 'string' && (SSO_DENIAL_REASONS as readonly string[]).includes(value);
}

export type IdTokenProblem = 'missing_subject' | 'wrong_issuer' | 'wrong_audience' | 'expired';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Checks the ID token claims oidc-client-ts doesn't: issuer, audience and
 * expiry. (The library checks state, nonce and subject; the signature is
 * checked by the API server, which is what actually trusts the token.)
 */
export function checkIdTokenClaims(
  claims: Record<string, unknown>,
  expected: { issuer: string; clientId: string; nowSeconds: number; skewSeconds?: number },
): IdTokenProblem | null {
  if (!str(claims.sub)) return 'missing_subject';
  const trim = (s: string) => s.replace(/\/+$/, '');
  if (str(claims.iss) === null || trim(claims.iss as string) !== trim(expected.issuer)) return 'wrong_issuer';
  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(expected.clientId)) return 'wrong_audience';
  const exp = typeof claims.exp === 'number' ? claims.exp : NaN;
  if (!Number.isFinite(exp) || exp + (expected.skewSeconds ?? 300) < expected.nowSeconds) return 'expired';
  return null;
}

/** The identity in a set of ID token claims, or null when the claims don't identify an account. */
export function identityFromClaims(provider: Pick<SsoProviderConfig, 'id' | 'trustEmailClaim'>, claims: Record<string, unknown>): ExternalIdentity | null {
  const issuer = str(claims.iss);
  // Entra ID's `sub` differs per application; `oid` is the account's
  // permanent id across the tenant, which is what the API server sees too.
  const subject = provider.id === 'microsoft' ? str(claims.oid) : str(claims.sub);
  if (!issuer || !subject) return null;
  const rawEmail = str(claims.email);
  const email = rawEmail && rawEmail.includes('@') ? rawEmail.toLowerCase() : null;
  return {
    providerId: provider.id,
    issuer,
    subject,
    email,
    emailTrusted: !!email && (claims.email_verified === true || provider.trustEmailClaim),
  };
}

export type StaffMatch =
  | { ok: true; staffId: string; newLink: ExternalIdentityLink | null }
  | { ok: false; reason: Extract<SsoDenialReason, 'not_provisioned' | 'inactive' | 'ambiguous' | 'already_linked'> };

const sameIdentity = (link: Pick<ExternalIdentityLink, 'issuer' | 'subject'>, identity: ExternalIdentity) =>
  link.issuer === identity.issuer && link.subject === identity.subject;

/** The staff record this identity signs in as, per the rule in this file's header. */
export function matchStaffToIdentity(
  identity: ExternalIdentity,
  staff: readonly StaffUser[],
  options: { linkByEmail: boolean; now: Date },
): StaffMatch {
  const linked = staff.filter(s => (s.externalIdentities ?? []).some(l => sameIdentity(l, identity)));
  if (linked.length > 1) return { ok: false, reason: 'ambiguous' };
  if (linked.length === 1) {
    return linked[0].status === 'Active'
      ? { ok: true, staffId: linked[0].id, newLink: null }
      : { ok: false, reason: 'inactive' };
  }

  if (!options.linkByEmail || !identity.email || !identity.emailTrusted) return { ok: false, reason: 'not_provisioned' };

  const byEmail = staff.filter(s => (s.email ?? '').trim().toLowerCase() === identity.email);
  if (byEmail.length === 0) return { ok: false, reason: 'not_provisioned' };
  const active = byEmail.filter(s => s.status === 'Active');
  if (active.length === 0) return { ok: false, reason: 'inactive' };
  if (active.length > 1) return { ok: false, reason: 'ambiguous' };

  const person = active[0];
  if ((person.externalIdentities ?? []).some(l => l.issuer === identity.issuer)) {
    return { ok: false, reason: 'already_linked' };
  }
  return {
    ok: true,
    staffId: person.id,
    newLink: {
      providerId: identity.providerId,
      issuer: identity.issuer,
      subject: identity.subject,
      linkedAt: options.now.toISOString(),
      linkedBy: 'first-sign-in',
    },
  };
}

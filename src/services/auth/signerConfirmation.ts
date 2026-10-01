// src/services/auth/signerConfirmation.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 follow-up (Batch 344): proving who is signing, at the moment of
// signing. Before this, the sign-out and finalize screens asked for a
// password and never checked it (the pre-finalisation panel accepted any
// three characters). Anyone at an unlocked session could sign a case.
//
// How the signer confirms depends on how they signed in:
//   • Password session (demo builds): the password again, checked against
//     the account. The first signature in a sign-in session also needs the
//     username; later ones need the password only. That is the two-
//     component rule for non-biometric e-signatures in a continuous session
//     (21 CFR 11.200(a)(1)).
//   • SSO session: the identity provider asks for their credentials again
//     in a popup (prompt=login, max_age=0). The answer must be the same
//     account as the session (issuer + permanent id) and freshly
//     authenticated (auth_time, or the token's iat, after the request).
//     PathScribe never sees the password.
//   • Biometric (the pre-finalisation panel): only in demo builds, because
//     today's WebAuthn check is simulated. It comes back when the API server
//     issues and verifies the WebAuthn challenge.
//
// Five failed confirmations lock signing for this user for 15 minutes
// (11.300(d): detect and report attempts at unauthorised use). A cancelled
// or blocked popup is not a failure. Every confirmation, failure and lock
// is audited (detail in literal English).
//
// The API server must repeat this check when it receives the signature;
// see docs/architecture/AUTHENTICATION_OIDC.md §5.4.
// ─────────────────────────────────────────────────────────────────────────────

import type { IAuditService } from '../auditlog/IAuditService';
import { findProvider, type AuthConfig } from './authConfig';
import { checkIdTokenClaims, identityFromClaims } from './externalIdentity';
import type { SessionProfile } from './sessionProfile';
import type { ISsoClient } from './sso/ssoClient';
import type { DemoAccount } from './demo/demoAccounts';
import { SSO_PROVIDER_AUDIT_NAMES } from './sso/resolveSsoProfile';

export const SIGNING_ACTIONS = [
  'case-sign-out', 'countersign', 'synoptic-finalize', 'report-finalize',
  'autopsy-pad', 'autopsy-fad', 'cytology-sign-out',
] as const;
export type SigningAction = typeof SIGNING_ACTIONS[number];

/** Audit wording for each action (literal English). */
export const SIGNING_ACTION_AUDIT_TEXT: Record<SigningAction, string> = {
  'case-sign-out': 'case sign-out',
  'countersign': 'countersignature',
  'synoptic-finalize': 'synoptic report finalisation',
  'report-finalize': 'report finalisation',
  'autopsy-pad': 'autopsy PAD signature',
  'autopsy-fad': 'autopsy FAD signature',
  'cytology-sign-out': 'cytology sign-out',
};

export type SignerMethod = 'password' | 'sso' | 'unavailable';

export const SIGNER_FAILURES = [
  'username_required', 'password_required', 'wrong_credentials', 'different_account', 'not_fresh', 'invalid_token',
  'cancelled', 'popup_blocked', 'provider_error', 'locked', 'no_session', 'unavailable',
] as const;
export type SignerFailure = typeof SIGNER_FAILURES[number];

export interface SignatureConfirmation {
  /** Batch 345: unique per confirmation; a confirmation can back one signature only. */
  confirmationId: string;
  signerId: string;
  signerName: string;
  method: 'password' | 'sso' | 'biometric';
  action: SigningAction;
  caseRef: string | null;
  confirmedAt: string;
  /**
   * Batch 345: what the signing request carries as proof. For SSO, the ID
   * token the provider returned to the confirmation popup; the server
   * verifies it (docs/architecture/AUTHENTICATION_OIDC.md §5.4). None for
   * the demo password and simulated biometric.
   */
  proof: { kind: 'oidc-id-token'; idToken: string } | null;
}

export type SignerResult =
  | { ok: true; confirmation: SignatureConfirmation }
  | { ok: false; reason: SignerFailure; lockedUntil?: string; attemptsLeft?: number };

// ── Lockout (pure) ─────────────────────────────────────────────────────────

export const SIGNING_LOCK_POLICY = { maxFailures: 5, lockMinutes: 15 } as const;

export interface SigningLockState { failures: number; lockedUntil: string | null }
export const NO_SIGNING_LOCK: SigningLockState = { failures: 0, lockedUntil: null };

/** The state as it stands now: an expired lock counts as no lock. */
export function currentSigningLock(state: SigningLockState | null | undefined, now: Date): SigningLockState {
  if (!state) return NO_SIGNING_LOCK;
  if (state.lockedUntil && Date.parse(state.lockedUntil) <= now.getTime()) return NO_SIGNING_LOCK;
  return state;
}

export function isSigningLocked(state: SigningLockState, now: Date): boolean {
  return !!state.lockedUntil && Date.parse(state.lockedUntil) > now.getTime();
}

export function recordSigningFailure(state: SigningLockState, now: Date, policy: { maxFailures: number; lockMinutes: number } = SIGNING_LOCK_POLICY): SigningLockState {
  const current = currentSigningLock(state, now);
  if (isSigningLocked(current, now)) return current;
  const failures = current.failures + 1;
  return failures >= policy.maxFailures
    ? { failures, lockedUntil: new Date(now.getTime() + policy.lockMinutes * 60_000).toISOString() }
    : { failures, lockedUntil: null };
}

// ── Method and checks (pure) ───────────────────────────────────────────────

export function signerMethodFor(profile: SessionProfile | null, config: AuthConfig): SignerMethod {
  if (!profile) return 'unavailable';
  if (profile.authMethod === 'sso') {
    return findProvider(config, profile.ssoProviderId) && profile.ssoIssuer && profile.ssoSubject ? 'sso' : 'unavailable';
  }
  return config.passwordSignIn ? 'password' : 'unavailable';
}

/** The username typed matches the signed-in user (email, any case). */
export function usernameMatchesSigner(entered: string, profile: Pick<SessionProfile, 'email'>): boolean {
  const e = entered.trim().toLowerCase();
  return !!e && e === (profile.email ?? '').trim().toLowerCase();
}

/**
 * Checks the provider's answer to a signature confirmation: a valid token
 * for this app, the same account as the session, and credentials entered
 * after the request (auth_time; the token's iat when a provider omits it).
 */
export function checkReauthClaims(
  claims: Record<string, unknown>,
  expected: {
    issuer: string; clientId: string; providerId: SessionProfile['ssoProviderId'];
    trustEmailClaim: boolean; sessionIssuer: string; sessionSubject: string;
    startedAtSeconds: number; nowSeconds: number; skewSeconds?: number;
  },
): Extract<SignerFailure, 'invalid_token' | 'different_account' | 'not_fresh'> | null {
  if (checkIdTokenClaims(claims, { issuer: expected.issuer, clientId: expected.clientId, nowSeconds: expected.nowSeconds })) return 'invalid_token';
  const identity = identityFromClaims({ id: expected.providerId as never, trustEmailClaim: expected.trustEmailClaim }, claims);
  if (!identity) return 'invalid_token';
  if (identity.issuer.replace(/\/+$/, '') !== expected.sessionIssuer.replace(/\/+$/, '') || identity.subject !== expected.sessionSubject) return 'different_account';
  const skew = expected.skewSeconds ?? 60;
  const at = typeof claims.auth_time === 'number' ? claims.auth_time : typeof claims.iat === 'number' ? claims.iat : NaN;
  if (!Number.isFinite(at) || at < expected.startedAtSeconds - skew) return 'not_fresh';
  return null;
}

// ── The service ────────────────────────────────────────────────────────────

export interface SignerConfirmationDeps {
  config: AuthConfig;
  readProfile: () => SessionProfile | null;
  verifyDemoCredentials: ((email: string, password: string) => Promise<DemoAccount | null>) | null;
  ssoClient: () => ISsoClient;
  auditService: Pick<IAuditService, 'logEvent'>;
  lockStore: { read(userId: string): SigningLockState | null; write(userId: string, state: SigningLockState): void };
  /** The sign-in session a signature was last confirmed in (for the username rule). */
  signingSession: { current(): string | null; lastConfirmed(): string | null; markConfirmed(sessionId: string): void };
  biometric: { verify(userId: string): Promise<{ ok: boolean }> };
  now?: () => Date;
  newId?: () => string;
}

export interface SigningContext { action: SigningAction; caseRef?: string | null }

export function createSignerConfirmation(deps: SignerConfirmationDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());

  const audit = (profile: SessionProfile, event: string, detail: string, caseRef?: string | null) => {
    void deps.auditService.logEvent({ type: 'user', event, detail, user: profile.name, caseId: caseRef ?? null, confidence: null }).catch(() => {});
  };

  const methodText = (profile: SessionProfile, method: SignatureConfirmation['method']) =>
    method === 'sso' ? SSO_PROVIDER_AUDIT_NAMES[profile.ssoProviderId as keyof typeof SSO_PROVIDER_AUDIT_NAMES] ?? 'single sign-on'
      : method === 'biometric' ? 'biometric' : 'password';

  const lockFor = (profile: SessionProfile) => currentSigningLock(deps.lockStore.read(profile.id), now());

  const succeed = (profile: SessionProfile, method: SignatureConfirmation['method'], ctx: SigningContext, proof: SignatureConfirmation['proof'] = null): SignerResult => {
    deps.lockStore.write(profile.id, NO_SIGNING_LOCK);
    const session = deps.signingSession.current();
    if (session) deps.signingSession.markConfirmed(session);
    const confirmation: SignatureConfirmation = {
      confirmationId: newId(),
      signerId: profile.id, signerName: profile.name, method, action: ctx.action,
      caseRef: ctx.caseRef ?? null, confirmedAt: now().toISOString(), proof,
    };
    audit(profile, 'Signature confirmed', `Signer identity confirmed by ${methodText(profile, method)} for ${SIGNING_ACTION_AUDIT_TEXT[ctx.action]}.`, ctx.caseRef);
    return { ok: true, confirmation };
  };

  const fail = (profile: SessionProfile, method: SignatureConfirmation['method'], ctx: SigningContext, reason: SignerFailure): SignerResult => {
    const next = recordSigningFailure(lockFor(profile), now());
    deps.lockStore.write(profile.id, next);
    const detailBase = `Signer identity not confirmed by ${methodText(profile, method)} for ${SIGNING_ACTION_AUDIT_TEXT[ctx.action]} (${reason}); failed attempt ${next.failures} of ${SIGNING_LOCK_POLICY.maxFailures}.`;
    audit(profile, 'Signature confirmation failed', detailBase, ctx.caseRef);
    if (next.lockedUntil) {
      audit(profile, 'Signing locked', `Signing locked for ${SIGNING_LOCK_POLICY.lockMinutes} minutes after ${SIGNING_LOCK_POLICY.maxFailures} failed signature confirmations.`, ctx.caseRef);
      return { ok: false, reason: 'locked', lockedUntil: next.lockedUntil };
    }
    return { ok: false, reason, attemptsLeft: SIGNING_LOCK_POLICY.maxFailures - next.failures };
  };

  /** Checks shared by every method; a result means stop. */
  const precheck = (want: SignerMethod | 'biometric'): { profile: SessionProfile } | { stop: SignerResult } => {
    const profile = deps.readProfile();
    if (!profile) return { stop: { ok: false, reason: 'no_session' } };
    const method = signerMethodFor(profile, deps.config);
    if (want === 'biometric' ? !deps.config.passwordSignIn : method !== want) return { stop: { ok: false, reason: 'unavailable' } };
    const lock = lockFor(profile);
    if (isSigningLocked(lock, now())) return { stop: { ok: false, reason: 'locked', lockedUntil: lock.lockedUntil! } };
    return { profile };
  };

  const needsUsername = (): boolean => {
    const current = deps.signingSession.current();
    return !current || deps.signingSession.lastConfirmed() !== current;
  };

  return {
    /** How the signed-in user confirms a signature. */
    method(): SignerMethod {
      return signerMethodFor(deps.readProfile(), deps.config);
    },

    /** The first signature in a sign-in session needs the username as well as the password. */
    needsUsername,

    /** Simulated biometric is offered only in demo builds. */
    biometricAllowed(): boolean {
      return deps.config.passwordSignIn && !!deps.readProfile();
    },

    /** When signing is locked for the signed-in user, until when. */
    lockedUntil(): string | null {
      const profile = deps.readProfile();
      if (!profile) return null;
      const lock = lockFor(profile);
      return isSigningLocked(lock, now()) ? lock.lockedUntil : null;
    },

    async withPassword(input: { username: string; password: string } & SigningContext): Promise<SignerResult> {
      const pre = precheck('password');
      if ('stop' in pre) return pre.stop;
      const { profile } = pre;
      if (needsUsername() && !input.username.trim()) return { ok: false, reason: 'username_required' };
      if (!input.password) return { ok: false, reason: 'password_required' };
      if (input.username.trim() && !usernameMatchesSigner(input.username, profile)) return fail(profile, 'password', input, 'wrong_credentials');
      const account = deps.verifyDemoCredentials ? await deps.verifyDemoCredentials(profile.email, input.password) : null;
      if (!account || account.id !== profile.id) return fail(profile, 'password', input, 'wrong_credentials');
      return succeed(profile, 'password', input);
    },

    /** Call straight from the click: the popup opens before anything is awaited. */
    withSso(ctx: SigningContext): Promise<SignerResult> {
      const pre = precheck('sso');
      if ('stop' in pre) return Promise.resolve(pre.stop);
      const { profile } = pre;
      const provider = findProvider(deps.config, profile.ssoProviderId)!;
      const startedAtSeconds = Math.floor(now().getTime() / 1000);
      const answer = deps.ssoClient().reauthenticate(provider.id, profile.email || undefined);
      return answer.then(r => {
        if (r.ok === false) return { ok: false, reason: r.reason } as SignerResult;
        const problem = checkReauthClaims(r.claims, {
          issuer: r.issuer, clientId: provider.clientId, providerId: provider.id, trustEmailClaim: provider.trustEmailClaim,
          sessionIssuer: profile.ssoIssuer!, sessionSubject: profile.ssoSubject!,
          startedAtSeconds, nowSeconds: Math.floor(now().getTime() / 1000),
        });
        return problem ? fail(profile, 'sso', ctx, problem) : succeed(profile, 'sso', ctx, { kind: 'oidc-id-token', idToken: r.idToken });
      });
    },

    async withBiometric(ctx: SigningContext): Promise<SignerResult> {
      const pre = precheck('biometric');
      if ('stop' in pre) return pre.stop;
      const { profile } = pre;
      const r = await deps.biometric.verify(profile.id).catch(() => ({ ok: false }));
      return r.ok ? succeed(profile, 'biometric', ctx) : fail(profile, 'biometric', ctx, 'wrong_credentials');
    },

    /** In the popup, on /auth/signing/<provider>. */
    completePopup(providerId: string, url: string): Promise<void> {
      return deps.ssoClient().completeReauthPopup(providerId, url);
    },
  };
}

export type SignerConfirmationService = ReturnType<typeof createSignerConfirmation>;

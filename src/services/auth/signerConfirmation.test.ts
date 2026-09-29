// src/services/auth/signerConfirmation.test.ts — Batch 344 (PS-60 follow-up)
import { describe, it, expect } from 'vitest';
import type { NewAuditLog } from '../auditlog/IAuditService';
import { resolveAuthConfig } from './authConfig';
import type { SessionProfile } from './sessionProfile';
import type { ISsoClient, SsoReauthResult } from './sso/ssoClient';
import type { DemoAccount } from './demo/demoAccounts';
import {
  checkReauthClaims, createSignerConfirmation, currentSigningLock, isSigningLocked, recordSigningFailure,
  signerMethodFor, usernameMatchesSigner, NO_SIGNING_LOCK, SIGNING_LOCK_POLICY, type SigningLockState,
} from './signerConfirmation';

const ISS = 'https://login.microsoftonline.com/tenant-1/v2.0';
const ENTRA = { VITE_AUTH_MICROSOFT_AUTHORITY: ISS, VITE_AUTH_MICROSOFT_CLIENT_ID: 'spa' };
const NOW = new Date('2026-09-26T12:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);

const pw: SessionProfile = { id: 'PATH-001', name: 'Pete Nimmo', email: 'demo@pathscribe.ai', role: 'superadmin', initials: 'PN', voiceProfile: 'EN-US', authMethod: 'password' };
const sso: SessionProfile = { id: '1', name: 'Sarah Chen', email: 'schen@hospital.org', role: 'pathologist', initials: 'SC', voiceProfile: 'EN-US', authMethod: 'sso', ssoProviderId: 'microsoft', ssoIssuer: ISS, ssoSubject: 'oid-1' };
const ACCOUNT = { id: 'PATH-001', email: 'demo@pathscribe.ai' } as DemoAccount;

function setup(opts: { profile?: SessionProfile | null; env?: Record<string, string>; reauth?: SsoReauthResult; biometricOk?: boolean; session?: string | null } = {}) {
  const audit: NewAuditLog[] = [];
  const locks = new Map<string, SigningLockState>();
  let lastConfirmed: string | null = null;
  let now = NOW;
  const reauthCalls: (string | undefined)[] = [];
  const client = {
    reauthenticate: (_p: string, hint?: string) => { reauthCalls.push(hint); return Promise.resolve(opts.reauth ?? { ok: false, reason: 'cancelled' }); },
    completeReauthPopup: async () => {},
  } as unknown as ISsoClient;
  const svc = createSignerConfirmation({
    config: resolveAuthConfig(opts.env ?? ENTRA, true),
    readProfile: () => (opts.profile === undefined ? pw : opts.profile),
    verifyDemoCredentials: async (e, p) => (e === 'demo@pathscribe.ai' && p === 'right' ? ACCOUNT : null),
    ssoClient: () => client,
    auditService: { logEvent: async e => { audit.push(e); return { ok: true, data: { ...e, id: 'a', timestamp: '' } }; } },
    lockStore: { read: id => locks.get(id) ?? null, write: (id, s) => { locks.set(id, s); } },
    signingSession: { current: () => (opts.session === undefined ? 'tab-1' : opts.session), lastConfirmed: () => lastConfirmed, markConfirmed: id => { lastConfirmed = id; } },
    biometric: { verify: async () => ({ ok: opts.biometricOk ?? true }) },
    now: () => now,
  });
  return { svc, audit, locks, reauthCalls, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

describe('lockout (pure)', () => {
  it('locks after five failures for fifteen minutes, then clears', () => {
    let s = NO_SIGNING_LOCK;
    for (let i = 0; i < 4; i++) s = recordSigningFailure(s, NOW);
    expect(s).toEqual({ failures: 4, lockedUntil: null });
    s = recordSigningFailure(s, NOW);
    expect(s.lockedUntil).toBe('2026-09-26T12:15:00.000Z');
    expect(isSigningLocked(s, NOW)).toBe(true);
    expect(recordSigningFailure(s, NOW)).toBe(s); // failures while locked don't extend it
    const later = new Date('2026-09-26T12:15:00Z');
    expect(currentSigningLock(s, later)).toEqual(NO_SIGNING_LOCK);
    expect(recordSigningFailure(s, later)).toEqual({ failures: 1, lockedUntil: null });
    expect(SIGNING_LOCK_POLICY).toEqual({ maxFailures: 5, lockMinutes: 15 });
  });
});

describe('signerMethodFor / usernameMatchesSigner', () => {
  const demo = resolveAuthConfig(ENTRA, true);
  it('password in demo builds, SSO for an SSO session that knows its account, else unavailable', () => {
    expect(signerMethodFor(pw, demo)).toBe('password');
    expect(signerMethodFor({ ...pw, authMethod: undefined }, demo)).toBe('password'); // pre-343 sessions
    expect(signerMethodFor(pw, resolveAuthConfig({ ...ENTRA, VITE_AUTH_MODE: 'sso' }, true))).toBe('unavailable');
    expect(signerMethodFor(sso, demo)).toBe('sso');
    expect(signerMethodFor({ ...sso, ssoSubject: undefined }, demo)).toBe('unavailable'); // signed in before Batch 344
    expect(signerMethodFor(sso, resolveAuthConfig({}, true))).toBe('unavailable');
    expect(signerMethodFor(null, demo)).toBe('unavailable');
  });
  it('matches the signed-in email, any case', () => {
    expect(usernameMatchesSigner(' Demo@PathScribe.ai ', pw)).toBe(true);
    expect(usernameMatchesSigner('someone@else.org', pw)).toBe(false);
    expect(usernameMatchesSigner('', pw)).toBe(false);
  });
});

describe('checkReauthClaims', () => {
  const expected = { issuer: ISS, clientId: 'spa', providerId: 'microsoft', trustEmailClaim: true, sessionIssuer: ISS, sessionSubject: 'oid-1', startedAtSeconds: NOW_S, nowSeconds: NOW_S + 20 };
  const claims = { iss: ISS, aud: 'spa', sub: 'x', oid: 'oid-1', exp: NOW_S + 3600, iat: NOW_S + 10, auth_time: NOW_S + 5 };
  it('accepts the same account, freshly authenticated', () => {
    expect(checkReauthClaims(claims, expected)).toBeNull();
    expect(checkReauthClaims({ ...claims, auth_time: undefined }, expected)).toBeNull(); // falls back to iat
  });
  it('refuses another account, a stale login, or a bad token', () => {
    expect(checkReauthClaims({ ...claims, oid: 'oid-2' }, expected)).toBe('different_account');
    expect(checkReauthClaims(claims, { ...expected, sessionIssuer: 'https://other' })).toBe('different_account');
    expect(checkReauthClaims({ ...claims, auth_time: NOW_S - 3600 }, expected)).toBe('not_fresh');
    expect(checkReauthClaims({ ...claims, auth_time: undefined, iat: undefined }, expected)).toBe('not_fresh');
    expect(checkReauthClaims({ ...claims, aud: 'other' }, expected)).toBe('invalid_token');
    expect(checkReauthClaims({ ...claims, oid: undefined }, expected)).toBe('invalid_token');
  });
});

describe('password confirmation', () => {
  it('first signature in a sign-in session needs the username, later ones only the password', async () => {
    const t = setup();
    expect(t.svc.needsUsername()).toBe(true);
    expect(await t.svc.withPassword({ username: '', password: 'right', action: 'case-sign-out' })).toEqual({ ok: false, reason: 'username_required' });
    const r = await t.svc.withPassword({ username: 'DEMO@pathscribe.ai', password: 'right', action: 'case-sign-out', caseRef: 'S26-0001' });
    expect(r).toMatchObject({ ok: true, confirmation: { signerId: 'PATH-001', method: 'password', action: 'case-sign-out', caseRef: 'S26-0001', confirmedAt: NOW.toISOString() } });
    expect(t.audit.slice(-1)[0]).toMatchObject({ event: 'Signature confirmed', detail: 'Signer identity confirmed by password for case sign-out.', caseId: 'S26-0001', user: 'Pete Nimmo' });
    expect(t.svc.needsUsername()).toBe(false);
    expect(await t.svc.withPassword({ username: '', password: 'right', action: 'report-finalize' })).toMatchObject({ ok: true });
  });

  it('a wrong password or someone else\'s username fails, is audited, and counts toward the lock', async () => {
    const t = setup();
    expect(await t.svc.withPassword({ username: 'demo@pathscribe.ai', password: 'wrong', action: 'countersign' })).toEqual({ ok: false, reason: 'wrong_credentials', attemptsLeft: 4 });
    expect(await t.svc.withPassword({ username: 'other@pathscribe.ai', password: 'right', action: 'countersign' })).toEqual({ ok: false, reason: 'wrong_credentials', attemptsLeft: 3 });
    expect(t.audit.map(a => a.event)).toEqual(['Signature confirmation failed', 'Signature confirmation failed']);
    expect(t.audit[1].detail).toBe('Signer identity not confirmed by password for countersignature (wrong_credentials); failed attempt 2 of 5.');
  });

  it('an empty password is asked for again without counting', async () => {
    const t = setup();
    expect(await t.svc.withPassword({ username: 'demo@pathscribe.ai', password: '', action: 'case-sign-out' })).toEqual({ ok: false, reason: 'password_required' });
    expect(t.locks.size).toBe(0);
  });

  it('five failures lock signing for 15 minutes, even with the right password; it unlocks after', async () => {
    const t = setup();
    for (let i = 0; i < 4; i++) await t.svc.withPassword({ username: 'demo@pathscribe.ai', password: 'wrong', action: 'case-sign-out' });
    expect(await t.svc.withPassword({ username: 'demo@pathscribe.ai', password: 'wrong', action: 'case-sign-out' })).toEqual({ ok: false, reason: 'locked', lockedUntil: '2026-09-26T12:15:00.000Z' });
    expect(t.audit.slice(-1)[0]).toMatchObject({ event: 'Signing locked' });
    expect(t.svc.lockedUntil()).toBe('2026-09-26T12:15:00.000Z');
    expect(await t.svc.withPassword({ username: 'demo@pathscribe.ai', password: 'right', action: 'case-sign-out' })).toMatchObject({ ok: false, reason: 'locked' });
    t.advance(15 * 60_000);
    expect(await t.svc.withPassword({ username: 'demo@pathscribe.ai', password: 'right', action: 'case-sign-out' })).toMatchObject({ ok: true });
  });

  it('is refused when there is no session, or this session signs with SSO', async () => {
    expect(await setup({ profile: null }).svc.withPassword({ username: 'a', password: 'b', action: 'case-sign-out' })).toEqual({ ok: false, reason: 'no_session' });
    expect(await setup({ profile: sso }).svc.withPassword({ username: 'a', password: 'b', action: 'case-sign-out' })).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('SSO confirmation', () => {
  const fresh = { iss: ISS, aud: 'spa', sub: 'x', oid: 'oid-1', exp: NOW_S + 3600, iat: NOW_S, auth_time: NOW_S };

  it('asks the provider (with the user\'s email as hint) and accepts the same account', async () => {
    const t = setup({ profile: sso, reauth: { ok: true, claims: fresh, issuer: ISS, idToken: 'id.token.x' } });
    const r = await t.svc.withSso({ action: 'autopsy-fad', caseRef: 'A26-1' });
    expect(r).toMatchObject({ ok: true, confirmation: { method: 'sso', action: 'autopsy-fad', signerId: '1', proof: { kind: 'oidc-id-token', idToken: 'id.token.x' } } });
    expect(t.reauthCalls).toEqual(['schen@hospital.org']);
    expect(t.audit[0].detail).toBe('Signer identity confirmed by Microsoft Entra ID for autopsy FAD signature.');
  });

  it('a different account in the popup is refused and counted', async () => {
    const t = setup({ profile: sso, reauth: { ok: true, claims: { ...fresh, oid: 'someone-else' }, issuer: ISS, idToken: 'id.token.x' } });
    expect(await t.svc.withSso({ action: 'case-sign-out' })).toEqual({ ok: false, reason: 'different_account', attemptsLeft: 4 });
  });

  it('a cancelled or blocked popup is not a failed attempt', async () => {
    for (const reason of ['cancelled', 'popup_blocked'] as const) {
      const t = setup({ profile: sso, reauth: { ok: false, reason } });
      expect(await t.svc.withSso({ action: 'case-sign-out' })).toEqual({ ok: false, reason });
      expect(t.locks.size).toBe(0);
      expect(t.audit).toEqual([]);
    }
  });

  it('opens the popup synchronously (no await before it, or the browser blocks it)', () => {
    const t = setup({ profile: sso, reauth: { ok: true, claims: fresh, issuer: ISS, idToken: 'id.token.x' } });
    void t.svc.withSso({ action: 'case-sign-out' });
    expect(t.reauthCalls).toHaveLength(1);
  });
});

describe('biometric confirmation (simulated, demo builds only)', () => {
  it('confirms in a demo build; refused in an SSO-only build', async () => {
    expect(await setup().svc.withBiometric({ action: 'report-finalize' })).toMatchObject({ ok: true, confirmation: { method: 'biometric' } });
    expect(await setup({ env: { ...ENTRA, VITE_AUTH_MODE: 'sso' }, profile: sso }).svc.withBiometric({ action: 'report-finalize' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(await setup({ biometricOk: false }).svc.withBiometric({ action: 'report-finalize' })).toMatchObject({ ok: false, reason: 'wrong_credentials' });
  });
});

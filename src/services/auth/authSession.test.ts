// src/services/auth/authSession.test.ts — PS-60 (Batch 343)
// Sign-in, session start/end and restore, with fakes for every dependency.
import { describe, it, expect, vi } from 'vitest';
import type { StaffUser } from '../users/IUserService';
import type { NewAuditLog } from '../auditlog/IAuditService';
import { createAuthSession, type AuthSessionDeps, type SessionMarkers } from './authSession';
import { resolveAuthConfig } from './authConfig';
import type { ISsoClient, SsoCompletion } from './sso/ssoClient';
import type { SessionProfile } from './sessionProfile';
import type { DemoAccount } from './demo/demoAccounts';

const TENANT = 'tenant-1';
const ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const ENTRA = { VITE_AUTH_MICROSOFT_AUTHORITY: ISS, VITE_AUTH_MICROSOFT_CLIENT_ID: 'spa' };

const staff = (id: string, email: string, extra: Partial<StaffUser> = {}): StaffUser => ({
  id, firstName: 'Sarah', lastName: 'Chen', email, roles: ['Pathologist'], npi: '', license: '', phone: '', status: 'Active',
  organisationId: 'ORG-DVMC', canViewPediatric: true, ...extra,
});
const ROLES = [
  { id: 'pathologist', name: 'Pathologist', caseAccess: true, configAccess: false },
  { id: 'admin', name: 'Admin', caseAccess: false, configAccess: true },
  { id: 'physician', name: 'Physician', caseAccess: false, configAccess: false },
];
const DEMO: DemoAccount = { email: 'demo@pathscribe.ai', id: 'PATH-001', name: 'Pete Nimmo', role: 'superadmin', initials: 'PN', voiceProfile: 'EN-US', password: { iterations: 1, salt: '', hash: '' } };

function memoryMarkers(): SessionMarkers & { active: Map<string, string>; own: string | null } {
  let n = 0;
  const m = {
    active: new Map<string, string>(),
    own: null as string | null,
    getActiveSessionId: (u: string) => m.active.get(u) ?? null,
    setActiveSessionId: (u: string, s: string) => { m.active.set(u, s); },
    clearActiveSessionId: (u: string) => { m.active.delete(u); },
    getOwnSessionId: () => m.own,
    setOwnSessionId: (s: string) => { m.own = s; },
    clearOwnSessionId: () => { m.own = null; },
    generateSessionId: () => `s${++n}`,
  };
  return m;
}

function fakeSso(completion: SsoCompletion, opts: { hasSession?: boolean; token?: string | null } = {}) {
  const signedOut: string[] = [];
  const client: ISsoClient = {
    providers: [],
    begin: vi.fn(async () => ({ ok: true as const })),
    complete: vi.fn(async () => completion),
    accessToken: vi.fn(async () => opts.token ?? 'access-token'),
    hasSession: vi.fn(async () => opts.hasSession ?? true),
    signOut: vi.fn(async (id: string) => { signedOut.push(id); }),
    reauthenticate: vi.fn(async () => ({ ok: false as const, reason: 'cancelled' as const })),
    completeReauthPopup: vi.fn(async () => {}),
  };
  return { client, signedOut };
}

function setup(over: Partial<AuthSessionDeps> & { env?: Record<string, string>; people?: StaffUser[]; stored?: SessionProfile | null; completion?: SsoCompletion; hasSession?: boolean } = {}) {
  const people = over.people ?? [staff('1', 'schen@hospital.org')];
  const audit: NewAuditLog[] = [];
  const updates: { id: string; changes: Partial<StaffUser> }[] = [];
  let stored: SessionProfile | null = over.stored ?? null;
  const markers = memoryMarkers();
  const sso = fakeSso(over.completion ?? { ok: true, providerId: 'microsoft', claims: { iss: ISS, sub: 'x', oid: 'oid-1', email: 'SChen@hospital.org' }, returnPath: '/worklist' }, { hasSession: over.hasSession });
  const drafts: string[] = [];
  const deps: AuthSessionDeps = {
    config: resolveAuthConfig(over.env ?? ENTRA, true),
    verifyDemoCredentials: async (e, p) => (e === DEMO.email && p === 'right' ? DEMO : null),
    ssoClient: () => sso.client,
    apiBaseUrl: null,
    userService: {
      getAll: async () => ({ ok: true, data: people }),
      update: async (id, changes) => { updates.push({ id, changes }); const s = people.find(p => p.id === id)!; Object.assign(s, changes); return { ok: true, data: s }; },
    },
    roleService: { getAll: async () => ({ ok: true, data: ROLES as never }) },
    auditService: { logEvent: async e => { audit.push(e); return { ok: true, data: { ...e, id: 'a', timestamp: '' } }; } },
    draftCacheService: { clearAllDraftsForUser: async id => { drafts.push(id); return { ok: true, data: undefined }; } },
    markers,
    profileStore: { read: () => stored, write: p => { stored = p; } },
    shouldShowBiometricWizard: () => false,
    now: () => new Date('2026-09-26T12:00:00Z'),
    ...over,
  };
  return { session: createAuthSession(deps), audit, updates, markers, sso, drafts, stored: () => stored, people };
}

describe('password sign-in (demo accounts)', () => {
  it('signs in a demo account with its staff fields', async () => {
    const t = setup({ people: [staff('PATH-001', 'pete.nimmo@pathscribe.ai', { organisationId: 'ORG-DVMC', canViewOrchestration: true })] });
    const p = await t.session.signInWithPassword(DEMO.email, 'right');
    expect(p).toMatchObject({ id: 'PATH-001', role: 'superadmin', authMethod: 'password', organisationId: 'ORG-DVMC', canViewOrchestration: true });
  });
  it('refuses a wrong password', async () => {
    expect(await setup().session.signInWithPassword(DEMO.email, 'wrong')).toBeNull();
  });
  it('is off in sso mode, and in a build without the demo accounts', async () => {
    expect(await setup({ env: { ...ENTRA, VITE_AUTH_MODE: 'sso' } }).session.signInWithPassword(DEMO.email, 'right')).toBeNull();
    expect(await setup({ verifyDemoCredentials: null }).session.signInWithPassword(DEMO.email, 'right')).toBeNull();
  });
});

describe('SSO sign-in (no API server: matched against the local staff directory)', () => {
  it('first sign-in links the account by email, audits the link, and returns the profile and return path', async () => {
    const t = setup();
    const r = await t.session.completeSsoSignIn('microsoft', 'https://app/auth/callback/microsoft?code=c');
    expect(r).toMatchObject({ ok: true, returnPath: '/worklist', profile: { id: '1', name: 'Sarah Chen', role: 'pathologist', authMethod: 'sso', ssoProviderId: 'microsoft', organisationId: 'ORG-DVMC' } });
    expect(t.updates).toEqual([{ id: '1', changes: { externalIdentities: [{ providerId: 'microsoft', issuer: ISS, subject: 'oid-1', linkedAt: '2026-09-26T12:00:00.000Z', linkedBy: 'first-sign-in' }] } }]);
    expect(t.audit.map(a => a.event)).toEqual(['SSO account linked']);
    expect(t.audit[0].detail).toBe('Account at Microsoft Entra ID linked to staff record 1 at first sign-in, matched by email.');

    // Next time the link is used (no second update), even if the email changed.
    t.people[0].email = 'sarah.chen@hospital.org';
    expect(await t.session.completeSsoSignIn('microsoft', 'u2')).toMatchObject({ ok: true, profile: { id: '1' } });
    expect(t.updates).toHaveLength(1);
  });

  it('refuses someone with no staff record, audits it, and forgets their tokens', async () => {
    const t = setup({ people: [staff('1', 'someone-else@hospital.org')] });
    expect(await t.session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'not_provisioned' });
    expect(t.audit).toEqual([expect.objectContaining({ event: 'SSO sign-in refused', detail: 'Sign-in with Microsoft Entra ID refused (not_provisioned).', user: 'schen@hospital.org' })]);
    expect(t.sso.signedOut).toEqual(['microsoft']);
  });

  it('refuses a directory-only role (no app access)', async () => {
    const t = setup({ people: [staff('1', 'schen@hospital.org', { roles: ['Physician'] })] });
    expect(await t.session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'no_app_access' });
    expect(t.updates).toEqual([]); // nothing linked for someone who can't sign in
  });

  it('passes on the provider refusal, and refuses a provider this build does not offer', async () => {
    expect(await setup({ completion: { ok: false, reason: 'cancelled' } }).session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'cancelled' });
    expect(await setup().session.completeSsoSignIn('oidc', 'u')).toEqual({ ok: false, reason: 'not_configured' });
  });
});

describe('SSO sign-in through the API server', () => {
  it('asks /api/me with the access token and uses its profile', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ profile: { id: 'S-9', name: 'Dr Ada', email: 'ada@h.org', role: 'pathologist-admin', initials: 'DA', voiceProfile: 'EN-GB', organisationId: 'ORG-1' } }), { status: 200 }));
    const t = setup({ apiBaseUrl: 'https://api.h.org/', fetch: fetch as unknown as typeof globalThis.fetch });
    const r = await t.session.completeSsoSignIn('microsoft', 'u');
    expect(r).toMatchObject({ ok: true, profile: { id: 'S-9', role: 'pathologist-admin', authMethod: 'sso', ssoProviderId: 'microsoft' } });
    expect(fetch).toHaveBeenCalledWith('https://api.h.org/api/me', { headers: { Authorization: 'Bearer access-token', Accept: 'application/json' } });
    expect(t.updates).toEqual([]); // the server does the linking
  });

  it('maps the server refusals', async () => {
    const reply = (status: number, body: unknown) => setup({ apiBaseUrl: 'https://api', fetch: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch });
    expect(await reply(403, { reason: 'inactive' }).session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'inactive' });
    expect(await reply(403, { reason: 'something-new' }).session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'not_provisioned' });
    expect(await reply(401, {}).session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'invalid_token' });
    expect(await reply(500, {}).session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'server_unavailable' });
    expect(await reply(200, { profile: { id: 'x', name: 'y', role: 'god' } }).session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'server_unavailable' });
    const down = setup({ apiBaseUrl: 'https://api', fetch: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
    expect(await down.session.completeSsoSignIn('microsoft', 'u')).toEqual({ ok: false, reason: 'server_unavailable' });
  });
});

describe('starting and ending a session', () => {
  const profile = { id: '1', name: 'Sarah Chen', email: 'e', role: 'pathologist', initials: 'SC', voiceProfile: 'EN-US', authMethod: 'sso', ssoProviderId: 'microsoft' } as SessionProfile;

  it('reports a conflict with another tab unless the user confirmed, and audits the sign-in', () => {
    const t = setup();
    t.markers.active.set('1', 'other-tab');
    expect(t.session.startSession(profile, false)).toEqual({ result: 'session_conflict' });
    expect(t.stored()).toBeNull();
    expect(t.session.startSession(profile, true)).toEqual({ result: 'success', showBiometricWizard: false });
    expect(t.stored()).toEqual(profile);
    expect(t.markers.active.get('1')).toBe(t.markers.own);
    expect(t.audit.slice(-1)[0]).toMatchObject({ event: 'Signed in', detail: 'Signed in with Microsoft Entra ID.', user: 'Sarah Chen' });
  });

  it('explicit sign-out clears drafts, releases the marker, forgets SSO tokens', () => {
    const t = setup();
    t.session.startSession(profile, false);
    t.session.endSession(profile, true);
    expect(t.drafts).toEqual(['1']);
    expect(t.markers.active.has('1')).toBe(false);
    expect(t.markers.own).toBeNull();
    expect(t.sso.signedOut).toEqual(['microsoft']);
    expect(t.stored()).toBeNull();
  });

  it('idle timeout keeps drafts; a superseded tab leaves the newer marker alone', () => {
    const t = setup();
    t.session.startSession(profile, false);
    t.markers.active.set('1', 'newer-tab');
    t.session.endSession(profile, false);
    expect(t.drafts).toEqual([]);
    expect(t.markers.active.get('1')).toBe('newer-tab');
  });

  it('a cancelled conflict prompt forgets the pending SSO tokens', async () => {
    const t = setup();
    await t.session.abandonPendingSession(profile);
    expect(t.sso.signedOut).toEqual(['microsoft']);
  });
});

describe('restoring a session on page load', () => {
  const pw = { id: 'PATH-001', name: 'Pete', email: 'e', role: 'superadmin', initials: 'PN', voiceProfile: '', canViewPediatric: false, canViewOrchestration: false, canAccessCrossTenantQa: false, organisationId: 'ORG-DVMC' } as unknown as SessionProfile;
  const sso = { ...pw, id: '1', role: 'pathologist', authMethod: 'sso', ssoProviderId: 'microsoft' } as SessionProfile;

  it('keeps a password session in demo mode (a pre-Batch-343 one has no authMethod)', async () => {
    const t = setup({ stored: pw });
    expect(await t.session.restoreSession()).toMatchObject({ id: 'PATH-001', voiceProfile: 'EN-US' });
  });

  it('drops a password session in an sso build', async () => {
    const t = setup({ env: { ...ENTRA, VITE_AUTH_MODE: 'sso' }, stored: pw });
    expect(await t.session.restoreSession()).toBeNull();
    expect(t.stored()).toBeNull();
  });

  it('keeps an SSO session only while its tokens are there and its provider is offered', async () => {
    expect(await setup({ stored: sso }).session.restoreSession()).toMatchObject({ id: '1' });
    const noTokens = setup({ stored: sso, hasSession: false });
    expect(await noTokens.session.restoreSession()).toBeNull();
    expect(noTokens.stored()).toBeNull();
    expect(await setup({ stored: sso, env: {} }).session.restoreSession()).toBeNull();
  });

  it('fills in staff fields a stored session predates (otherwise no organisation = no cases)', async () => {
    const old = { ...pw, organisationId: undefined } as SessionProfile;
    const t = setup({ stored: old, people: [staff('PATH-001', 'x', { organisationId: 'ORG-DVMC' })] });
    expect(await t.session.restoreSession()).toMatchObject({ organisationId: 'ORG-DVMC', canViewPediatric: true });
    expect(t.stored()).toMatchObject({ organisationId: 'ORG-DVMC' });
  });

  it('takes back the active-session marker a reload released, unless another tab has it', async () => {
    const t = setup({ stored: pw });
    t.markers.own = 'tab-a';
    await t.session.restoreSession();
    expect(t.markers.active.get('PATH-001')).toBe('tab-a');
    const u = setup({ stored: pw });
    u.markers.own = 'tab-a';
    u.markers.active.set('PATH-001', 'tab-b');
    await u.session.restoreSession();
    expect(u.markers.active.get('PATH-001')).toBe('tab-b');
  });

  it('nothing stored: nothing restored', async () => {
    expect(await setup().session.restoreSession()).toBeNull();
  });
});

describe('the access token for API and hub calls', () => {
  it('only for an SSO session', async () => {
    const sso = { id: '1', authMethod: 'sso', ssoProviderId: 'microsoft' } as SessionProfile;
    expect(await setup({ stored: sso }).session.accessToken()).toBe('access-token');
    expect(await setup({ stored: { ...sso, authMethod: 'password' } }).session.accessToken()).toBeNull();
    expect(await setup().session.accessToken()).toBeNull();
  });
});

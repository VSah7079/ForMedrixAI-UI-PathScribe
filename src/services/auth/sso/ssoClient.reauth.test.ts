// @vitest-environment node
// src/services/auth/sso/ssoClient.reauth.test.ts — Batch 344 (PS-60 follow-up)
// The signature-confirmation popup: what is asked of the provider, where
// the fresh tokens go (not the session's store), and how failures read.
import { describe, it, expect } from 'vitest';
import { InMemoryWebStorage, type UserManagerSettings } from 'oidc-client-ts';
import { createSsoClient, reauthSettingsFor, signingCallbackProvider, ssoSigningRedirectUri, type OidcReauthManagerLike } from './ssoClient';
import type { SsoProviderConfig } from '../authConfig';

const provider: SsoProviderConfig = { id: 'microsoft', authority: 'https://login.microsoftonline.com/t/v2.0', clientId: 'spa', scope: 'openid profile email offline_access api://x/y', linkByEmail: true, trustEmailClaim: true };
const ORIGIN = 'https://pathscribe.example.org';

function client(signinPopup: OidcReauthManagerLike['signinPopup']) {
  const settings: UserManagerSettings[] = [];
  const args: unknown[] = [];
  const c = createSsoClient([provider], {
    origin: ORIGIN, storage: new InMemoryWebStorage(), log: () => {},
    createReauthManager: s => {
      settings.push(s);
      return { signinPopup: (a) => { args.push(a); return signinPopup(a); }, signinPopupCallback: async () => {}, metadataService: { getIssuer: async () => 'https://iss' } };
    },
  });
  return { c, settings, args };
}

describe('SSO signature re-authentication', () => {
  it('asks for credentials again (prompt=login, max_age=0), hints the account, returns the claims', async () => {
    const t = client(async () => ({ profile: { sub: 's', oid: 'o' }, id_token: 'raw.id.token' }) as never);
    expect(await t.c.reauthenticate('microsoft', 'schen@hospital.org')).toEqual({ ok: true, claims: { sub: 's', oid: 'o' }, issuer: 'https://iss', idToken: 'raw.id.token' });
    expect(t.args[0]).toMatchObject({ prompt: 'login', max_age: 0, login_hint: 'schen@hospital.org' });
  });

  it('uses its own popup callback, no API scope, and a throwaway token store', () => {
    const s = reauthSettingsFor(provider, ORIGIN, new InMemoryWebStorage());
    expect(s.popup_redirect_uri).toBe(`${ORIGIN}/auth/signing/microsoft`);
    expect(ssoSigningRedirectUri(`${ORIGIN}/`, 'oidc')).toBe(`${ORIGIN}/auth/signing/oidc`);
    expect(s.scope).toBe('openid profile email');
    expect(s.automaticSilentRenew).toBe(false);
    expect(s.userStore).toBeDefined();
    expect(s.userStore).not.toBe(s.stateStore);
  });

  it('maps popup outcomes', async () => {
    expect(await client(async () => { throw new Error('Popup blocked by user'); }).c.reauthenticate('microsoft')).toMatchObject({ ok: false, reason: 'popup_blocked' });
    expect(await client(async () => { throw new Error('Popup closed by user'); }).c.reauthenticate('microsoft')).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(await client(async () => { throw Object.assign(new Error('x'), { error: 'access_denied' }); }).c.reauthenticate('microsoft')).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(await client(async () => { throw Object.assign(new Error('x'), { error: 'server_error' }); }).c.reauthenticate('microsoft')).toMatchObject({ ok: false, reason: 'provider_error' });
    expect(await client(async () => ({}) as never).c.reauthenticate('google')).toMatchObject({ ok: false, reason: 'provider_error' });
  });

  it('recognises the popup callback path', () => {
    expect(signingCallbackProvider('/auth/signing/microsoft')).toBe('microsoft');
    expect(signingCallbackProvider('/auth/signing/oidc/')).toBe('oidc');
    expect(signingCallbackProvider('/auth/callback/microsoft')).toBeNull();
    expect(signingCallbackProvider('/auth/signing/../x')).toBeNull();
  });
});

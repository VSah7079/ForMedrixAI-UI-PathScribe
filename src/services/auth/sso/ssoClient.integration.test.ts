// @vitest-environment node
// src/services/auth/sso/ssoClient.integration.test.ts — PS-60 (Batch 343).
// The real oidc-client-ts, through ssoClient, against a local OpenID
// Connect provider (testing/fakeOidcProvider.ts) that checks PKCE and
// refuses a client secret. The browser redirect is played by fetch:
// build the sign-in request, follow /authorize to its 302, hand the
// callback URL to complete().

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { InMemoryWebStorage, OidcClient } from 'oidc-client-ts';
import { startFakeOidcProvider, type FakeOidcProvider } from '../testing/fakeOidcProvider';
import { createSsoClient, managerSettingsFor, ssoRedirectUri } from './ssoClient';
import type { SsoProviderConfig } from '../authConfig';

const ORIGIN = 'http://127.0.0.1:5199';

describe('SSO sign-in, end to end (real oidc-client-ts, local provider)', { timeout: 20_000 }, () => {
  let idp: FakeOidcProvider;
  let provider: SsoProviderConfig;
  beforeAll(async () => {
    idp = await startFakeOidcProvider();
    provider = { id: 'oidc', authority: idp.issuer, clientId: idp.clientId, scope: 'openid profile email offline_access', linkByEmail: true, trustEmailClaim: false };
  });
  afterAll(async () => { await idp.close(); });
  beforeEach(() => { idp.setIdTokenIssuer(null); idp.setAccessTokenLifetime(3600); });

  /** What the browser does between begin() and the callback page. */
  async function signInAtProvider(storage: Storage, returnPath: string): Promise<string> {
    const request = await new OidcClient(managerSettingsFor(provider, ORIGIN, storage)).createSigninRequest({ state: { returnPath } });
    // The return path stays in this tab: it is not in the URL sent to the provider.
    if (returnPath.length > 1) expect(request.url).not.toContain(encodeURIComponent(returnPath).slice(0, 12));
    const res = await fetch(request.url, { redirect: 'manual' });
    expect(res.status).toBe(302);
    return res.headers.get('location')!;
  }

  it('signs in with PKCE and no secret, checks the ID token, returns the page the user wanted', async () => {
    const storage = new InMemoryWebStorage();
    idp.setAccount({ sub: 'abc-123', email: 'SChen@Hospital.org', email_verified: true, name: 'Sarah Chen' });
    const client = createSsoClient([provider], { origin: ORIGIN, storage, log: () => {} });

    const callback = await signInAtProvider(storage, '/cases/S26-0001?tab=report');
    expect(callback.startsWith(ssoRedirectUri(ORIGIN, 'oidc'))).toBe(true);
    const done = await client.complete('oidc', callback);
    expect(done).toMatchObject({ ok: true, providerId: 'oidc', returnPath: '/cases/S26-0001?tab=report' });
    if (done.ok === false) throw new Error('unreachable');
    expect(done.claims).toMatchObject({ sub: 'abc-123', iss: idp.issuer, aud: idp.clientId, email: 'SChen@Hospital.org', email_verified: true });

    // The code exchange sent the PKCE verifier and no secret (the provider refuses one).
    expect(idp.tokenRequests().slice(-1)[0]).toEqual({ grant_type: 'authorization_code', had_verifier: true });
    expect(await client.hasSession('oidc')).toBe(true);
    const token = await client.accessToken('oidc');
    expect(token?.split('.')).toHaveLength(3);

    // The same callback URL again (React StrictMode) gets the same answer, not an error.
    expect(await client.complete('oidc', callback)).toBe(done);

    await client.signOut('oidc');
    expect(await client.hasSession('oidc')).toBe(false);
    expect(await client.accessToken('oidc')).toBeNull();
  });

  it('renews an expired access token with the refresh token', async () => {
    const storage = new InMemoryWebStorage();
    idp.setAccessTokenLifetime(1);
    const client = createSsoClient([provider], { origin: ORIGIN, storage, log: () => {} });
    const done = await client.complete('oidc', await signInAtProvider(storage, '/'));
    expect(done.ok).toBe(true);
    const first = await client.accessToken('oidc');
    idp.setAccessTokenLifetime(3600);
    await new Promise(r => setTimeout(r, 1_200)); // let it expire
    const renewed = await client.accessToken('oidc');
    expect(renewed).toBeTruthy();
    expect(renewed).not.toBe(first);
    expect(idp.tokenRequests().slice(-1)[0]?.grant_type).toBe('refresh_token');
  });

  it('refuses an ID token from another issuer, and forgets its tokens', async () => {
    const storage = new InMemoryWebStorage();
    idp.setIdTokenIssuer('https://evil.example');
    const client = createSsoClient([provider], { origin: ORIGIN, storage, log: () => {} });
    const done = await client.complete('oidc', await signInAtProvider(storage, '/'));
    expect(done).toEqual({ ok: false, reason: 'invalid_token', detail: 'wrong_issuer' });
    expect(await client.hasSession('oidc')).toBe(false);
  });

  it('reports a cancelled sign-in as cancelled', async () => {
    const storage = new InMemoryWebStorage();
    idp.setAccount(null);
    const client = createSsoClient([provider], { origin: ORIGIN, storage, log: () => {} });
    const done = await client.complete('oidc', await signInAtProvider(storage, '/'));
    expect(done).toMatchObject({ ok: false, reason: 'cancelled' });
    idp.setAccount({ sub: 'abc-123', email: 'schen@hospital.org', email_verified: true });
  });

  it('refuses a callback it never started (no stored state), and a provider it does not offer', async () => {
    const client = createSsoClient([provider], { origin: ORIGIN, storage: new InMemoryWebStorage(), log: () => {} });
    const forged = `${ssoRedirectUri(ORIGIN, 'oidc')}?code=stolen&state=0123456789abcdef`;
    expect(await client.complete('oidc', forged)).toMatchObject({ ok: false, reason: 'provider_error' });
    expect(await client.complete('microsoft', forged)).toEqual({ ok: false, reason: 'not_configured' });
    expect(await client.begin('google', '/')).toEqual({ ok: false, reason: 'not_configured' });
  });
});

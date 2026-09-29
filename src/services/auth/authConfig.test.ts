// src/services/auth/authConfig.test.ts — PS-60 (Batch 343)
import { describe, it, expect } from 'vitest';
import { resolveAuthConfig, microsoftTenantOf, findProvider, DEFAULT_SSO_SCOPES } from './authConfig';

const TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';
const entra = {
  VITE_AUTH_MICROSOFT_AUTHORITY: `https://login.microsoftonline.com/${TENANT}/v2.0/`,
  VITE_AUTH_MICROSOFT_CLIENT_ID: 'spa-client',
};

describe('resolveAuthConfig', () => {
  it('defaults to demo mode: password sign-in, no providers, no problems', () => {
    expect(resolveAuthConfig({}, true)).toEqual({ mode: 'demo', passwordSignIn: true, providers: [], problems: [] });
    expect(resolveAuthConfig({ VITE_AUTH_MODE: ' Demo ' }, true).mode).toBe('demo');
  });

  it('sso mode turns password sign-in off', () => {
    const c = resolveAuthConfig({ VITE_AUTH_MODE: 'sso', ...entra }, true);
    expect(c).toMatchObject({ mode: 'sso', passwordSignIn: false, problems: [] });
    expect(c.providers.map(p => p.id)).toEqual(['microsoft']);
  });

  it('fails closed on an unknown mode', () => {
    const c = resolveAuthConfig({ VITE_AUTH_MODE: 'oidc', ...entra }, true);
    expect(c.passwordSignIn).toBe(false);
    expect(c.problems[0]).toMatch(/not recognised/);
  });

  it('reports sso mode with nobody able to sign in', () => {
    expect(resolveAuthConfig({ VITE_AUTH_MODE: 'sso' }, true).problems).toEqual([expect.stringMatching(/no SSO provider/)]);
  });

  it('builds the Microsoft provider: trailing slash dropped, API scope added, email trusted, linking on by default', () => {
    const [p] = resolveAuthConfig({ ...entra, VITE_AUTH_MICROSOFT_API_SCOPE: 'api://pathscribe/access_as_user' }, true).providers;
    expect(p).toEqual({
      id: 'microsoft',
      authority: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      clientId: 'spa-client',
      scope: `${DEFAULT_SSO_SCOPES} api://pathscribe/access_as_user`,
      linkByEmail: true,
      trustEmailClaim: true,
    });
  });

  it('refuses the shared Microsoft endpoints, which let any account in', () => {
    for (const tenant of ['common', 'organizations', 'consumers']) {
      const c = resolveAuthConfig({ ...entra, VITE_AUTH_MICROSOFT_AUTHORITY: `https://login.microsoftonline.com/${tenant}/v2.0` }, true);
      expect(c.providers).toEqual([]);
      expect(c.problems[0]).toMatch(new RegExp(`/${tenant}`));
    }
  });

  it('refuses a Microsoft authority on another host or with no tenant', () => {
    expect(resolveAuthConfig({ ...entra, VITE_AUTH_MICROSOFT_AUTHORITY: 'https://login.example.org/x' }, true).providers).toEqual([]);
    expect(resolveAuthConfig({ ...entra, VITE_AUTH_MICROSOFT_AUTHORITY: 'https://login.microsoftonline.com/' }, true).providers).toEqual([]);
  });

  it('never offers Google from the browser (it needs the client secret)', () => {
    const c = resolveAuthConfig({ VITE_AUTH_GOOGLE_AUTHORITY: 'https://accounts.google.com', VITE_AUTH_GOOGLE_CLIENT_ID: 'x' }, true);
    expect(c.providers).toEqual([]);
    expect(c.problems[0]).toMatch(/client secret/);
  });

  it('generic OIDC: needs email_verified, custom scopes keep openid, linking can be turned off', () => {
    const [p] = resolveAuthConfig({
      VITE_AUTH_OIDC_AUTHORITY: 'https://hospital.okta.com/oauth2/default',
      VITE_AUTH_OIDC_CLIENT_ID: 'okta-spa',
      VITE_AUTH_OIDC_SCOPES: 'profile email',
      VITE_AUTH_OIDC_LINK_BY_EMAIL: 'FALSE',
    }, true).providers;
    expect(p).toMatchObject({ id: 'oidc', scope: 'openid profile email', linkByEmail: false, trustEmailClaim: false });
  });

  it('https only in production; http to this machine allowed in development', () => {
    const local = { VITE_AUTH_OIDC_AUTHORITY: 'http://127.0.0.1:5301', VITE_AUTH_OIDC_CLIENT_ID: 'c' };
    expect(resolveAuthConfig(local, false).providers).toHaveLength(1);
    const prod = resolveAuthConfig(local, true);
    expect(prod.providers).toEqual([]);
    expect(prod.problems[0]).toMatch(/must be an https/);
    expect(resolveAuthConfig({ VITE_AUTH_OIDC_AUTHORITY: 'http://idp.example.org', VITE_AUTH_OIDC_CLIENT_ID: 'c' }, false).providers).toEqual([]);
  });

  it('reports half a configuration', () => {
    const c = resolveAuthConfig({ VITE_AUTH_OIDC_CLIENT_ID: 'c' }, true);
    expect(c.providers).toEqual([]);
    expect(c.problems[0]).toMatch(/must both be set/);
  });

  it('findProvider', () => {
    const c = resolveAuthConfig(entra, true);
    expect(findProvider(c, 'microsoft')?.clientId).toBe('spa-client');
    expect(findProvider(c, 'google')).toBeNull();
    expect(findProvider(c, undefined)).toBeNull();
  });
});

describe('microsoftTenantOf', () => {
  it('reads the tenant segment of an Entra authority', () => {
    expect(microsoftTenantOf(`https://login.microsoftonline.com/${TENANT}/v2.0`)).toBe(TENANT);
    expect(microsoftTenantOf('https://login.microsoftonline.us/Contoso.onmicrosoft.com/v2.0')).toBe('contoso.onmicrosoft.com');
    expect(microsoftTenantOf('https://hospital.ciamlogin.com/abc')).toBe('abc');
    expect(microsoftTenantOf('https://example.org/abc')).toBeNull();
    expect(microsoftTenantOf('not a url')).toBeNull();
  });
});

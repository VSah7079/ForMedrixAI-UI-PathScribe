// src/services/auth/sso/ssoClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): signing in with the hospital's identity provider,
// using the OpenID Connect authorization code flow with PKCE
// (oidc-client-ts). No client secret is involved: the app is registered as
// a public "single-page application" client, and PKCE ties the code to
// this browser. So Entra ID, Okta, Ping and Keycloak need no server for
// the sign-in itself. The API server is still what trusts the token
// (docs/architecture/AUTHENTICATION_OIDC.md).
//
//   begin     → redirects to the provider. The page the user wanted is kept
//               with the sign-in request's state in this tab (not sent to
//               the provider, since a path can name a case) and checked
//               again on return.
//   complete  → on /auth/callback/<provider>: exchanges the code, then
//               checks issuer, audience and expiry (oidc-client-ts checks
//               state, nonce and subject). A second call with the same URL
//               (React StrictMode) gets the first call's result.
//   accessToken → the current access token for API and hub calls,
//               refreshed with the refresh token when it has expired.
//   signOut   → forgets the tokens in this tab. It doesn't sign the user
//               out of the provider: an idle timeout on a shared
//               workstation shouldn't end their other Microsoft sessions.
//
// Tokens are kept in sessionStorage by default: this tab only, gone when
// the tab closes, kept across a reload.
// ─────────────────────────────────────────────────────────────────────────────

import { InMemoryWebStorage, UserManager, WebStorageStateStore, type UserManagerSettings, type User as OidcUser } from 'oidc-client-ts';
import type { SsoProviderConfig, SsoProviderId } from '../authConfig';
import { checkIdTokenClaims, type SsoDenialReason } from '../externalIdentity';
import { resolvePostSignInPath } from '../sessionRole';

/** The parts of oidc-client-ts's UserManager this uses. */
export interface OidcManagerLike {
  signinRedirect(args?: { state?: unknown }): Promise<void>;
  signinRedirectCallback(url?: string): Promise<OidcUser>;
  getUser(): Promise<OidcUser | null>;
  signinSilent(): Promise<OidcUser | null>;
  removeUser(): Promise<void>;
  clearStaleState(): Promise<void>;
  metadataService: { getIssuer(): Promise<string> };
}

/** The parts of UserManager the signature re-authentication uses (Batch 344). */
export interface OidcReauthManagerLike {
  signinPopup(args?: { prompt?: string; max_age?: number; login_hint?: string; popupWindowFeatures?: Record<string, string | number | boolean | undefined> }): Promise<OidcUser>;
  signinPopupCallback(url?: string): Promise<void>;
  metadataService: { getIssuer(): Promise<string> };
}

/** The result of asking the provider to confirm who is signing. */
export type SsoReauthResult =
  | { ok: true; claims: Record<string, unknown>; issuer: string; /** Batch 345: the raw ID token, the proof sent with the signature. */ idToken: string }
  | { ok: false; reason: 'cancelled' | 'popup_blocked' | 'provider_error'; detail?: string };

export type SsoCompletion =
  | { ok: true; providerId: SsoProviderId; claims: Record<string, unknown>; returnPath: string }
  | { ok: false; reason: SsoDenialReason; detail?: string };

export interface ISsoClient {
  readonly providers: readonly SsoProviderConfig[];
  begin(providerId: string, returnPath: string): Promise<{ ok: true } | { ok: false; reason: SsoDenialReason; detail?: string }>;
  complete(providerId: string, url: string): Promise<SsoCompletion>;
  accessToken(providerId: string): Promise<string | null>;
  hasSession(providerId: string): Promise<boolean>;
  signOut(providerId: string): Promise<void>;
  /**
   * Batch 344: signature confirmation. Opens the provider in a popup and
   * makes the user enter their credentials again (prompt=login, max_age=0),
   * without touching this tab's session tokens. Must be called straight from
   * the click, with no await before it, or browsers block the popup.
   */
  reauthenticate(providerId: string, loginHint?: string): Promise<SsoReauthResult>;
  /** On /auth/signing/<provider>, inside the popup: hands the response back to the opener. */
  completeReauthPopup(providerId: string, url: string): Promise<void>;
}

export interface SsoClientDeps {
  /** This app's origin, e.g. https://pathscribe.hospital.org */
  origin: string;
  storage?: Storage;
  createManager?: (settings: UserManagerSettings) => OidcManagerLike;
  createReauthManager?: (settings: UserManagerSettings) => OidcReauthManagerLike;
  nowSeconds?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

export const SSO_CALLBACK_PATH = '/auth/callback';
/** Batch 344: where the signature-confirmation popup returns. Register it with the provider too. */
export const SSO_SIGNING_CALLBACK_PATH = '/auth/signing';

/** The provider id when this page is the signature-confirmation popup's callback, else null. */
export function signingCallbackProvider(pathname: string): string | null {
  const m = /^\/auth\/signing\/([a-z]+)\/?$/.exec(pathname);
  return m ? m[1] : null;
}

export function ssoSigningRedirectUri(origin: string, providerId: string): string {
  return `${origin.replace(/\/+$/, '')}${SSO_SIGNING_CALLBACK_PATH}/${providerId}`;
}

export function ssoRedirectUri(origin: string, providerId: string): string {
  return `${origin.replace(/\/+$/, '')}${SSO_CALLBACK_PATH}/${providerId}`;
}

/** The manager settings for one provider. Exported for the tests. */
export function managerSettingsFor(provider: SsoProviderConfig, origin: string, storage: Storage): UserManagerSettings {
  const store = new WebStorageStateStore({ store: storage, prefix: `pathscribe.sso.${provider.id}.` });
  return {
    authority: provider.authority,
    client_id: provider.clientId,
    redirect_uri: ssoRedirectUri(origin, provider.id),
    post_logout_redirect_uri: `${origin.replace(/\/+$/, '')}/login`,
    response_type: 'code',
    scope: provider.scope,
    loadUserInfo: false,
    monitorSession: false,
    automaticSilentRenew: true,
    userStore: store,
    stateStore: store,
  };
}

/**
 * Settings for the signature-confirmation manager: the popup callback, and
 * its own stores, so the fresh tokens never replace this tab's session
 * (and a different account signing in the popup can't take it over).
 */
export function reauthSettingsFor(provider: SsoProviderConfig, origin: string, storage: Storage): UserManagerSettings {
  return {
    ...managerSettingsFor(provider, origin, storage),
    popup_redirect_uri: ssoSigningRedirectUri(origin, provider.id),
    scope: 'openid profile email',
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    stateStore: new WebStorageStateStore({ store: storage, prefix: `pathscribe.sso-sign.${provider.id}.` }),
  };
}

const errorCode = (e: unknown): string | null =>
  e && typeof e === 'object' && typeof (e as { error?: unknown }).error === 'string' ? (e as { error: string }).error : null;

export function createSsoClient(providers: readonly SsoProviderConfig[], deps: SsoClientDeps): ISsoClient {
  const storage = deps.storage ?? globalThis.sessionStorage;
  const createManager = deps.createManager ?? (s => new UserManager(s) as unknown as OidcManagerLike);
  const nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const log = deps.log ?? ((m, d) => console.warn(`[sso] ${m}`, d ?? ''));
  const createReauthManager = deps.createReauthManager ?? (s => new UserManager(s) as unknown as OidcReauthManagerLike);
  const managers = new Map<string, OidcManagerLike>();
  const reauthManagers = new Map<string, OidcReauthManagerLike>();
  const reauthManagerFor = (provider: SsoProviderConfig) => {
    let m = reauthManagers.get(provider.id);
    if (!m) { m = createReauthManager(reauthSettingsFor(provider, deps.origin, storage)); reauthManagers.set(provider.id, m); }
    return m;
  };
  const completions = new Map<string, Promise<SsoCompletion>>();

  const providerFor = (id: string) => providers.find(p => p.id === id) ?? null;
  const managerFor = (provider: SsoProviderConfig) => {
    let m = managers.get(provider.id);
    if (!m) { m = createManager(managerSettingsFor(provider, deps.origin, storage)); managers.set(provider.id, m); }
    return m;
  };

  const doComplete = async (provider: SsoProviderConfig, url: string): Promise<SsoCompletion> => {
    const mgr = managerFor(provider);
    let user: OidcUser;
    try {
      user = await mgr.signinRedirectCallback(url);
    } catch (e) {
      const code = errorCode(e);
      log('sign-in response refused', code ?? e);
      // Entra ID and most providers answer "access_denied" when the user cancels.
      return { ok: false, reason: code === 'access_denied' ? 'cancelled' : 'provider_error', detail: code ?? (e instanceof Error ? e.message : String(e)) };
    }
    try {
      const issuer = await mgr.metadataService.getIssuer();
      const problem = checkIdTokenClaims(user.profile as Record<string, unknown>, { issuer, clientId: provider.clientId, nowSeconds: nowSeconds() });
      if (problem) {
        await mgr.removeUser();
        log('ID token refused', problem);
        return { ok: false, reason: 'invalid_token', detail: problem };
      }
    } catch (e) {
      await mgr.removeUser().catch(() => {});
      return { ok: false, reason: 'provider_error', detail: e instanceof Error ? e.message : String(e) };
    }
    void mgr.clearStaleState().catch(() => {});
    const saved = user.state && typeof user.state === 'object' ? (user.state as { returnPath?: unknown }).returnPath : undefined;
    return { ok: true, providerId: provider.id, claims: { ...user.profile }, returnPath: resolvePostSignInPath(saved) };
  };

  return {
    providers,
    async begin(providerId, returnPath) {
      const provider = providerFor(providerId);
      if (!provider) return { ok: false, reason: 'not_configured' };
      try {
        await managerFor(provider).signinRedirect({ state: { returnPath: resolvePostSignInPath(returnPath) } });
        return { ok: true };
      } catch (e) {
        log('could not start sign-in', e);
        return { ok: false, reason: 'provider_error', detail: e instanceof Error ? e.message : String(e) };
      }
    },
    complete(providerId, url) {
      const provider = providerFor(providerId);
      if (!provider) return Promise.resolve({ ok: false, reason: 'not_configured' });
      const key = `${providerId} ${url}`;
      let p = completions.get(key);
      if (!p) { p = doComplete(provider, url); completions.set(key, p); }
      return p;
    },
    async accessToken(providerId) {
      const provider = providerFor(providerId);
      if (!provider) return null;
      const mgr = managerFor(provider);
      try {
        const user = await mgr.getUser();
        if (!user) return null;
        if (!user.expired) return user.access_token;
        const renewed = await mgr.signinSilent();
        return renewed?.access_token ?? null;
      } catch (e) {
        log('could not renew the access token', e);
        return null;
      }
    },
    async hasSession(providerId) {
      const provider = providerFor(providerId);
      if (!provider) return false;
      try {
        const user = await managerFor(provider).getUser();
        return !!user && (!user.expired || !!user.refresh_token);
      } catch {
        return false;
      }
    },
    async signOut(providerId) {
      const provider = providerFor(providerId);
      if (!provider) return;
      await managerFor(provider).removeUser().catch(() => {});
    },
    reauthenticate(providerId, loginHint) {
      const provider = providerFor(providerId);
      if (!provider) return Promise.resolve({ ok: false, reason: 'provider_error', detail: 'not configured' });
      const mgr = reauthManagerFor(provider);
      // No await before signinPopup: it opens the window, and browsers only
      // allow that during the click.
      const popup = mgr.signinPopup({
        prompt: 'login', max_age: 0, ...(loginHint ? { login_hint: loginHint } : {}),
        popupWindowFeatures: { width: 520, height: 640 },
      });
      return popup.then(
        async (user): Promise<SsoReauthResult> => ({ ok: true, claims: { ...user.profile }, issuer: await mgr.metadataService.getIssuer(), idToken: user.id_token ?? '' }),
        (e): SsoReauthResult => {
          const message = e instanceof Error ? e.message : String(e);
          const code = errorCode(e);
          if (/popup blocked/i.test(message)) return { ok: false, reason: 'popup_blocked', detail: message };
          if (/popup closed/i.test(message) || code === 'access_denied') return { ok: false, reason: 'cancelled', detail: code ?? message };
          log('signature confirmation failed', code ?? e);
          return { ok: false, reason: 'provider_error', detail: code ?? message };
        },
      );
    },
    async completeReauthPopup(providerId, url) {
      const provider = providerFor(providerId);
      if (!provider) return;
      await reauthManagerFor(provider).signinPopupCallback(url);
    },
  };
}

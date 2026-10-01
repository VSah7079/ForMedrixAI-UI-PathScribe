// src/services/auth/authSession.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): signing in and out, outside React. AuthContext calls
// this and keeps only React state; the decisions live here.
//
//   Password sign-in   demo accounts only (VITE_AUTH_MODE unset or "demo")
//   SSO sign-in        begin → provider → /auth/callback/<id> → complete:
//                      tokens checked (ssoClient), then the person resolved
//                      by the API server, or locally when there is none yet
//   startSession       same-browser session conflict check (another tab
//                      already signed in as this user), then stores the
//                      profile and claims this tab as the active session
//   endSession         clears drafts on an explicit sign-out only (an idle
//                      timeout or a superseded tab keeps them), releases the
//                      active-session marker if it is still this tab's,
//                      forgets SSO tokens, removes the profile
//   restoreSession     on page load: the stored profile, if its sign-in
//                      method is still allowed and, for SSO, its tokens are
//                      still there; staff fields filled in if missing
//
// Created with its dependencies (authSessionInstance.ts wires the real
// ones), so tests pass fakes.
// ─────────────────────────────────────────────────────────────────────────────

import type { IUserService } from '../users/IUserService';
import type { IRoleService } from '../roles/IRoleService';
import type { IAuditService } from '../auditlog/IAuditService';
import type { IDraftCacheService } from '../drafts/IDraftCacheService';
import { findProvider, type AuthConfig } from './authConfig';
import { identityFromClaims, type SsoDenialReason } from './externalIdentity';
import type { ISsoClient } from './sso/ssoClient';
import { resolveSsoProfileFromApi, resolveSsoProfileLocally, SSO_PROVIDER_AUDIT_NAMES } from './sso/resolveSsoProfile';
import { profileNeedsStaffFields, staffSessionFields, type SessionProfile } from './sessionProfile';
import type { DemoAccount } from './demo/demoAccounts';

export interface SessionMarkers {
  getActiveSessionId(userId: string): string | null;
  setActiveSessionId(userId: string, sessionId: string): void;
  clearActiveSessionId(userId: string): void;
  getOwnSessionId(): string | null;
  setOwnSessionId(sessionId: string): void;
  clearOwnSessionId(): void;
  generateSessionId(): string;
}

export interface AuthSessionDeps {
  config: AuthConfig;
  /** Null when this build has no demo accounts (VITE_AUTH_MODE=sso). */
  verifyDemoCredentials: ((email: string, password: string) => Promise<DemoAccount | null>) | null;
  /** Created on first use, so importing this module never touches the browser. */
  ssoClient: () => ISsoClient;
  /** The API server, when there is one (VITE_API_BASE_URL). */
  apiBaseUrl: string | null;
  userService: Pick<IUserService, 'getAll' | 'update'>;
  roleService: Pick<IRoleService, 'getAll'>;
  auditService: Pick<IAuditService, 'logEvent'>;
  draftCacheService: Pick<IDraftCacheService, 'clearAllDraftsForUser'>;
  markers: SessionMarkers;
  profileStore: { read(): SessionProfile | null; write(p: SessionProfile | null): void };
  shouldShowBiometricWizard: (userId: string) => boolean;
  fetch?: typeof fetch;
  now?: () => Date;
}

export type SsoSignInResult =
  | { ok: true; profile: SessionProfile; returnPath: string }
  | { ok: false; reason: SsoDenialReason };

export type StartSessionResult =
  | { result: 'success'; showBiometricWizard: boolean }
  | { result: 'session_conflict' };

export function createAuthSession(deps: AuthSessionDeps) {
  const now = deps.now ?? (() => new Date());

  const staffFor = async (id: string) => {
    const res = await deps.userService.getAll().catch(() => null);
    return res && res.ok !== false ? res.data.find(s => s.id === id) ?? null : null;
  };

  const auditSignIn = (profile: SessionProfile) => {
    const how = profile.authMethod === 'sso'
      ? SSO_PROVIDER_AUDIT_NAMES[profile.ssoProviderId as keyof typeof SSO_PROVIDER_AUDIT_NAMES] ?? 'single sign-on'
      : 'a password';
    void deps.auditService.logEvent({
      type: 'user', event: 'Signed in', detail: `Signed in with ${how}.`,
      user: profile.name, caseId: null, confidence: null,
    }).catch(() => {});
  };

  return {
    config: deps.config,

    /** The demo-account profile for this email and password, or null. */
    async signInWithPassword(email: string, password: string): Promise<SessionProfile | null> {
      if (!deps.config.passwordSignIn || !deps.verifyDemoCredentials) return null;
      const account = await deps.verifyDemoCredentials(email, password);
      if (!account) return null;
      const staff = await staffFor(account.id);
      return {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        initials: account.initials,
        voiceProfile: account.voiceProfile,
        ...staffSessionFields(staff),
        authMethod: 'password',
      };
    },

    /** Sends the browser to the provider. Only returns if it couldn't. */
    async beginSsoSignIn(providerId: string, returnPath: string): Promise<{ ok: false; reason: SsoDenialReason } | { ok: true }> {
      const r = await deps.ssoClient().begin(providerId, returnPath);
      return r.ok === false ? { ok: false, reason: r.reason } : { ok: true };
    },

    /** Finishes the sign-in on the callback page. */
    async completeSsoSignIn(providerId: string, url: string): Promise<SsoSignInResult> {
      const provider = findProvider(deps.config, providerId);
      if (!provider) return { ok: false, reason: 'not_configured' };
      const client = deps.ssoClient();
      const done = await client.complete(providerId, url);
      if (done.ok === false) return { ok: false, reason: done.reason };

      const resolved = deps.apiBaseUrl
        ? await resolveSsoProfileFromApi(provider, { apiBaseUrl: deps.apiBaseUrl, accessToken: await client.accessToken(providerId), fetch: deps.fetch })
        : await resolveSsoProfileLocally(provider, done.claims, { ...deps, now });
      if (resolved.ok === false) {
        await client.signOut(providerId);
        return { ok: false, reason: resolved.reason };
      }
      // Remember which account this is, for signature confirmation (Batch 344).
      const identity = identityFromClaims(provider, done.claims);
      const profile: SessionProfile = { ...resolved.profile, ssoIssuer: identity?.issuer, ssoSubject: identity?.subject };
      return { ok: true, profile, returnPath: done.returnPath };
    },

    /** Stores the session, unless this user is already active in another tab and the user hasn't confirmed. */
    startSession(profile: SessionProfile, forceSupersede: boolean): StartSessionResult {
      if (!forceSupersede && deps.markers.getActiveSessionId(profile.id)) return { result: 'session_conflict' };
      deps.profileStore.write(profile);
      const sessionId = deps.markers.generateSessionId();
      deps.markers.setActiveSessionId(profile.id, sessionId);
      deps.markers.setOwnSessionId(sessionId);
      auditSignIn(profile);
      return { result: 'success', showBiometricWizard: deps.shouldShowBiometricWizard(profile.id) };
    },

    /** Gives up a session held for the conflict prompt that the user then cancelled. */
    async abandonPendingSession(profile: SessionProfile): Promise<void> {
      if (profile.authMethod === 'sso' && profile.ssoProviderId) await deps.ssoClient().signOut(profile.ssoProviderId);
    },

    endSession(profile: SessionProfile | null, clearDrafts: boolean): void {
      if (profile?.id) {
        // Fire and forget: signing out never waits on this.
        if (clearDrafts) void deps.draftCacheService.clearAllDraftsForUser(profile.id);
        // Only release the active-session marker if it is still this tab's.
        // If a newer sign-in elsewhere took over, the marker is theirs.
        const ownId = deps.markers.getOwnSessionId();
        if (ownId && deps.markers.getActiveSessionId(profile.id) === ownId) deps.markers.clearActiveSessionId(profile.id);
        deps.markers.clearOwnSessionId();
      }
      if (profile?.authMethod === 'sso' && profile.ssoProviderId) void deps.ssoClient().signOut(profile.ssoProviderId);
      deps.profileStore.write(null);
    },

    /** Closing the tab releases the active-session marker (drafts stay). */
    releaseActiveMarker(userId: string): void {
      const ownId = deps.markers.getOwnSessionId();
      if (ownId && deps.markers.getActiveSessionId(userId) === ownId) deps.markers.clearActiveSessionId(userId);
    },

    /** The session to resume on page load, or null (and nothing stored) if there isn't a usable one. */
    async restoreSession(): Promise<SessionProfile | null> {
      const stored = deps.profileStore.read();
      if (!stored) return null;
      const method = stored.authMethod ?? 'password';
      let usable: boolean;
      if (method === 'sso') {
        usable = !!findProvider(deps.config, stored.ssoProviderId) && await deps.ssoClient().hasSession(stored.ssoProviderId!);
      } else {
        usable = deps.config.passwordSignIn;
      }
      if (!usable) { deps.profileStore.write(null); return null; }

      const profile: SessionProfile = { ...stored, voiceProfile: stored.voiceProfile || 'EN-US' };
      // A reload fires beforeunload, which released this tab's claim on the
      // active-session marker. Take it back if nobody else has, so a sign-in
      // in another tab is still reported as a conflict (fixed in Batch 343:
      // before, one reload was enough to lose the check).
      const ownId = deps.markers.getOwnSessionId();
      if (ownId && !deps.markers.getActiveSessionId(profile.id)) deps.markers.setActiveSessionId(profile.id, ownId);
      // A session stored before a staff-derived field existed gets it now;
      // otherwise it would stay locked out (no organisation = no cases).
      if (profileNeedsStaffFields(profile)) {
        Object.assign(profile, staffSessionFields(await staffFor(profile.id)));
        deps.profileStore.write(profile);
      }
      return profile;
    },

    /** Saves profile edits made in the app (display name, voice profile). */
    saveProfile(profile: SessionProfile): void {
      deps.profileStore.write(profile);
    },

    /** The signed-in user's access token for the API and the hub, or null. */
    async accessToken(): Promise<string | null> {
      const p = deps.profileStore.read();
      if (!p || p.authMethod !== 'sso' || !p.ssoProviderId || !findProvider(deps.config, p.ssoProviderId)) return null;
      return deps.ssoClient().accessToken(p.ssoProviderId);
    },
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;

// src/contexts/AuthContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Who is signed in, for React. Since PS-60 (Batch 343) the decisions live in
// services/auth/authSession.ts (exported from `@/services`): password sign-in
// against the hashed demo accounts, SSO with the organisation's identity
// provider, the same-browser session conflict check, sign-out and session
// restore. This file holds the React state and exposes useAuth().
//
// The hard-coded accounts and their plain-text passwords that used to be
// here are gone: see services/auth/demo/demoAccounts.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { authSession, authConfig } from "@/services";
import type { SessionProfile } from "@/services/auth/sessionProfile";
import type { SsoDenialReason } from "@/services/auth/externalIdentity";
import type { SsoProviderConfig } from "@/services/auth/authConfig";

/** The signed-in user. See services/auth/sessionProfile.ts for the fields. */
export type User = SessionProfile;

export type SignInOutcome = 'success' | 'invalid_credentials' | 'session_conflict';

export type SsoCompletionOutcome =
  | { outcome: 'success'; returnPath: string }
  | { outcome: 'session_conflict'; returnPath: string }
  | { outcome: 'refused'; reason: SsoDenialReason };

interface AuthContextType {
  user: User | null;
  /** forceSupersede: true only after the user confirmed signing out their
   *  other tab (LoginPage's 'session_conflict' prompt). */
  login: (email: string, password: string, forceSupersede?: boolean) => Promise<SignInOutcome>;
  /** Email + password sign-in is offered in this build. */
  passwordSignInEnabled: boolean;
  /** The SSO providers offered in this build. */
  ssoProviders: readonly SsoProviderConfig[];
  /** Sends the browser to the provider. Resolves with a reason if that failed, else null (on the way). */
  beginSsoSignIn: (providerId: string, returnPath: string) => Promise<SsoDenialReason | null>;
  /** On /auth/callback/<provider>. */
  completeSsoSignIn: (providerId: string, url: string) => Promise<SsoCompletionOutcome>;
  /** After a 'session_conflict': continue here (true) or give up (false). */
  resolvePendingSsoSignIn: (continueHere: boolean) => Promise<boolean>;
  /** clearDrafts defaults to true (explicit sign-out). The idle timeout and
   *  a superseded tab pass false: drafts are kept for recovery. */
  logout: (clearDrafts?: boolean) => void;
  updateUserProfile: (updates: Partial<User>) => void;
  isAuthenticated: boolean;
  loading: boolean;
  showBiometricWizard: boolean;
  setShowBiometricWizard: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [showBiometricWizard, setShowBiometricWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const pendingSso = useRef<User | null>(null);

  const start = useCallback((profile: User, forceSupersede: boolean): 'success' | 'session_conflict' => {
    const started = authSession.startSession(profile, forceSupersede);
    if (started.result === 'session_conflict') return 'session_conflict';
    setUser(profile);
    if (started.showBiometricWizard) setTimeout(() => setShowBiometricWizard(true), 800);
    return 'success';
  }, []);

  const login = async (email: string, password: string, forceSupersede = false): Promise<SignInOutcome> => {
    try {
      const profile = await authSession.signInWithPassword(email, password);
      if (!profile) return 'invalid_credentials';
      return start(profile, forceSupersede);
    } catch (e) {
      console.error("Login error:", e);
      return 'invalid_credentials';
    }
  };

  const beginSsoSignIn = async (providerId: string, returnPath: string): Promise<SsoDenialReason | null> => {
    const r = await authSession.beginSsoSignIn(providerId, returnPath);
    return r.ok === false ? r.reason : null;
  };

  // One completion per callback URL: React StrictMode runs the callback
  // page's effect twice, and a second start() would find the first one's
  // active-session marker and report a conflict with itself.
  const completing = useRef<{ key: string; outcome: Promise<SsoCompletionOutcome> } | null>(null);
  const completeSsoSignIn = useCallback((providerId: string, url: string): Promise<SsoCompletionOutcome> => {
    const key = `${providerId} ${url}`;
    if (completing.current?.key === key) return completing.current.outcome;
    const outcome = (async (): Promise<SsoCompletionOutcome> => {
      const r = await authSession.completeSsoSignIn(providerId, url);
      if (r.ok === false) return { outcome: 'refused', reason: r.reason };
      if (start(r.profile, false) === 'session_conflict') {
        pendingSso.current = r.profile;
        return { outcome: 'session_conflict', returnPath: r.returnPath };
      }
      return { outcome: 'success', returnPath: r.returnPath };
    })();
    completing.current = { key, outcome };
    return outcome;
  }, [start]);

  const resolvePendingSsoSignIn = useCallback(async (continueHere: boolean): Promise<boolean> => {
    const profile = pendingSso.current;
    pendingSso.current = null;
    if (!profile) return false;
    if (!continueHere) { await authSession.abandonPendingSession(profile); return false; }
    return start(profile, true) === 'success';
  }, [start]);

  const logout = useCallback((clearDrafts: boolean = true) => {
    authSession.endSession(user, clearDrafts);
    setUser(null);
  }, [user]);

  const updateUserProfile = (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    authSession.saveProfile(updated);
    setUser(updated);
  };

  // Closing the tab (not signing out) releases this tab's claim on the
  // active-session marker, so reopening the app doesn't report a conflict
  // with a tab that is gone. Drafts stay, as with an idle timeout.
  useEffect(() => {
    if (!user?.id) return;
    const handler = () => authSession.releaseActiveMarker(user.id);
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    authSession.restoreSession()
      .then(profile => { if (!cancelled && profile) setUser(profile); })
      .catch(e => console.error('Failed to restore session:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        passwordSignInEnabled: authConfig.passwordSignIn,
        ssoProviders: authConfig.providers,
        beginSsoSignIn,
        completeSsoSignIn,
        resolvePendingSsoSignIn,
        logout,
        showBiometricWizard,
        setShowBiometricWizard,
        updateUserProfile,
        isAuthenticated: !!user,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


// ── Role helper — use this in route guards instead of strict equality ─────────
// Handles "pathologist-admin" transparently alongside single roles.
export function roleHas(user: User | null, check: "pathologist" | "admin"): boolean {
  if (!user) return false;
  if (user.role === "pathologist-admin") return true;
  return user.role === check;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

// ── Shared admin-tier role checks ──────────────────────────────────────────
// One source of truth for "is this user an admin". "Admin-tier" gates
// whole admin surfaces (admin, pathologist-admin or superadmin), which is
// broader than roleHas(user, 'admin').
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return !!user && ['admin', 'pathologist-admin', 'superadmin'].includes(user.role);
}

export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === 'superadmin';
}

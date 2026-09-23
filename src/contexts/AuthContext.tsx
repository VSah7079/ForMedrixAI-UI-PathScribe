import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { VoiceProfileId } from "../constants/voiceProfiles";
import { shouldShowBiometricWizard } from "../services/biometric/mockBiometricService";
import { mockDraftCacheService } from "../services/drafts/mockDraftCacheService";
import {
  getActiveSessionId, setActiveSessionId, clearActiveSessionId,
  getOwnSessionId, setOwnSessionId, clearOwnSessionId, generateSessionId,
} from "../services/session/sessionSupersedeService";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "pathologist" | "admin" | "pathologist-admin" | "superadmin";
  initials: string;
  voiceProfile: VoiceProfileId;
  // ── Signature block fields ────────────────────────────────────────────────
  // Resolved from the StaffUser record at login (see resolveStaffFields).
  // `name` above is already a combined display string from the credentials
  // table; these additional fields let report signature blocks build a
  // precise formal name + credentials + signature image without needing
  // a separate staff lookup at sign-out time.
  credentials?: string;
  signatureUrl?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  canViewPediatric?: boolean;
  canViewOrchestration?: boolean;
  /** Real, granular cross-tenant QA/compliance reporting permission — see
   *  StaffUser.canAccessCrossTenantQa's own doc comment (IUserService.ts)
   *  and services/auth/caseAccessControl.ts's canViewCrossTenantQaData()
   *  for the full reasoning. Resolved the same way as the fields above. */
  canAccessCrossTenantQa?: boolean;
  /** The tenant/organisation boundary — see StaffUser.organisationId's
   *  own doc comment (IUserService.ts) for the full reasoning. Resolved
   *  from StaffUser at login/session-restore, same as the fields above.
   *  Read by services/auth/caseAccessControl.ts directly from
   *  localStorage — the mock services aren't React components and can't
   *  use this context, so they read the same persisted session object. */
  organisationId?: string;
  /** Real fallback-chain field, per direct follow-up: "Fallback to
   *  User Profile: If no device-level ID exists, pull the logged-in
   *  user's default_station_id." Resolved from StaffUser at login,
   *  same as the fields above — see StaffUser.defaultScanStationId's
   *  own doc comment (IUserService.ts) for the full reasoning. */
  defaultScanStationId?: string;
}

interface AuthContextType {
  user: User | null;
  /** forceSupersede: pass true only after the user has explicitly
   *  confirmed they want to log out their other active session — see
   *  LoginPage.tsx's handling of the 'session_conflict' result. Return
   *  type distinguishes the three real outcomes rather than collapsing
   *  "wrong password" and "you're already logged in elsewhere" into the
   *  same boolean false. */
  login: (email: string, password: string, forceSupersede?: boolean) => Promise<'success' | 'invalid_credentials' | 'session_conflict'>;
  /** clearDrafts defaults to true (explicit logout) — the idle-timeout-
   *  triggered call in ProtectedRoute.tsx must pass false, per the
   *  Inactivity Timeout & Draft Recovery spec's Timeout Preservation
   *  rule. Same rule applies to a session-
   *  supersede-triggered logout — also false, for the same reason.
   */
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

  const STORAGE_KEY = "pathscribe-user";

  const saveUser = (userData: User | null) => {
    if (userData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setUser(userData);
  };

  // Resolve extra fields from userService (canViewPediatric, credentials,
  // signatureUrl, and name parts — used by report signature blocks)
  // Option C: canViewPediatric lives on the StaffUser record, not the role
  const resolveStaffFields = async (userId: string): Promise<{
    canViewPediatric: boolean;
    canViewOrchestration: boolean;
    canAccessCrossTenantQa: boolean;
    credentials?: string;
    signatureUrl?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    organisationId?: string;
    defaultScanStationId?: string;
  }> => {
    try {
      const { userService } = await import('../services');
      const res = await userService.getAll();
      if (res.ok) {
        const staffUser = res.data.find(u => u.id === userId);
        if (staffUser) {
          return {
            canViewPediatric:     staffUser.canViewPediatric ?? false,
            canViewOrchestration: staffUser.canViewOrchestration ?? false,
            canAccessCrossTenantQa: staffUser.canAccessCrossTenantQa ?? false,
            credentials:      staffUser.credentials ?? undefined,
            signatureUrl:     staffUser.signatureUrl ?? undefined,
            firstName:        staffUser.firstName ?? undefined,
            middleName:       staffUser.middleName ?? undefined,
            lastName:         staffUser.lastName ?? undefined,
            organisationId:   staffUser.organisationId ?? undefined,
            defaultScanStationId: staffUser.defaultScanStationId ?? undefined,
          };
        }
      }
    } catch { /* non-critical — fail safe */ }
    // Fail-safe default: no organisationId resolved means no case access
    // (deny by default) rather than silently falling back to some default
    // tenant — matches the same "fail safe, not fail open" posture as
    // canViewPediatric/canViewOrchestration/canAccessCrossTenantQa
    // defaulting to false above.
    return { canViewPediatric: false, canViewOrchestration: false, canAccessCrossTenantQa: false };
  };

  const login = async (email: string, password: string, forceSupersede = false): Promise<'success' | 'invalid_credentials' | 'session_conflict'> => {
    try {
      let authenticatedUser: User | null = null;

      // Normalize input - trim whitespace and lowercase email
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPassword = password.trim();

      // Hardcoded credentials for demo/testing (fallback)
      // Role guide:
      //   "pathologist"       → clinical cases + reporting only
      //   "admin"             → configuration + user management only
      //   "pathologist-admin" → both (route guards should treat as both)
      const credentials = [
        { email: "pete.nimmo@pathscribe.ai",           password: "xyxRnJrIu64nsi0KqPn-",   id: "PATH-001",    name: "Pete Nimmo",           role: "superadmin"  as const, initials: "PN", voiceProfile: "EN-US" },
        { email: "demo@pathscribe.ai",                 password: "xyxRnJrIu64nsi0KqPn-",   id: "PATH-001",    name: "Pete Nimmo",           role: "superadmin"  as const, initials: "PN", voiceProfile: "EN-US" },
        { email: "sarah.johnson@demo.pathscribe.ai",   password: "xyxRnJrIu64nsi0KqPn-",   id: "PATH-SJ-001", name: "Dr. Sarah Johnson",    role: "superadmin"  as const, initials: "SJ", voiceProfile: "EN-US" },
        { email: "admin@pathscribe.ai",                password: "ZBs=inBiC6^N*XYwH3v^",   id: "u3",          name: "System Admin",         role: "superadmin"  as const, initials: "SA", voiceProfile: "EN-US" },
        { email: "paul.carter@mft.nhs.uk",             password: "Pathscribe_TempPass2026!", id: "PATH-UK-001", name: "Paul Carter",          role: "superadmin"  as const, initials: "PC", voiceProfile: "EN-GB" },
        { email: "bronwyn.prior@mft.nhs.uk",           password: "Pathscribe_Welcome2026!",  id: "PATH-UK-003", name: "Bronwyn Prior",        role: "superadmin"  as const, initials: "BP", voiceProfile: "EN-GB" },
        { email: "oliver.pemberton@mft.nhs.uk",        password: "xyxRnJrIu64nsi0KqPn-",   id: "PATH-UK-002", name: "Dr. Oliver Pemberton", role: "superadmin"  as const, initials: "OP", voiceProfile: "EN-GB" },
        { email: "amber.fehrs@demo.pathscribe.ai",     password: "One_Amazing_Person!",      id: "PATH-US-001", name: "Amber Fehrs-Battey",   role: "superadmin"  as const, initials: "AF", voiceProfile: "EN-US" },
        { email: "mark.tuthill@hfhs-demo.pathscribe.ai", password: "One_Amazing_Doctor!",   id: "PATH-US-002", name: "Dr. J. Mark Tuthill",  role: "superadmin"         as const, initials: "MT", voiceProfile: "EN-US" },
        // ── UX Review account — full pathologist + admin access ──────────────────
        { email: (import.meta.env.VITE_BABAKHANI_EMAIL ?? "rossana.babakhani@pathscribe.ai").toLowerCase(),
                                                            password: "Review_PathScribe_2026!", id: "PATH-RB-001", name: "Rossana Babakhani",     role: "superadmin"        as const, initials: "RB", voiceProfile: "EN-US" },
        // ── Android device test account — pathologist-admin, per real, typed
        //    role guide above (clinical + admin access, route guards treat
        //    as both). Not superadmin, deliberately - the narrower, exact
        //    role actually requested, not just copying the pattern every
        //    other entry here happens to use.
        { email: "michelle.nimmo@ai.com",                  password: "Android1-Tester-Coco#",   id: "PATH-MN-001", name: "Michelle Nimmo",       role: "pathologist-admin" as const, initials: "MN", voiceProfile: "EN-US" },
      ];

      // Find matching credential
      const cred = credentials.find(c => c.email.toLowerCase() === normalizedEmail && c.password === normalizedPassword);
      
      if (cred) {
        authenticatedUser = {
          id: cred.id,
          name: cred.name,
          email: email,
          role: cred.role || "pathologist",
          initials: cred.initials,
          voiceProfile: cred.voiceProfile,
        };
      }

      if (!authenticatedUser) return 'invalid_credentials';

      // Real session-conflict check — same user, another tab already
      // active on this browser. forceSupersede is only ever true after
      // the user explicitly confirmed on the warning LoginPage.tsx shows
      // for this exact result.
      if (!forceSupersede) {
        const existing = getActiveSessionId(authenticatedUser.id);
        if (existing) return 'session_conflict';
      }

      // Resolve canViewPediatric and credentials from StaffUser record (Option C)
      const staffFields = await resolveStaffFields(authenticatedUser.id);
      Object.assign(authenticatedUser, staffFields);

      saveUser(authenticatedUser);

      // Establish this tab as the one true active session for this user —
      // writing this triggers the native `storage` event in any OTHER tab
      // that had this same user logged in, which is what lets that other
      // tab detect it's just been superseded and log itself out (with
      // drafts preserved, not discarded — see ProtectedRoute.tsx).
      const newSessionId = generateSessionId();
      setActiveSessionId(authenticatedUser.id, newSessionId);
      setOwnSessionId(newSessionId);

      if (shouldShowBiometricWizard(authenticatedUser.id)) {
        setTimeout(() => setShowBiometricWizard(true), 800);
      }

      return 'success';
    } catch (e) {
      console.error("Login error:", e);
      return 'invalid_credentials';
    }
  };

  const logout = (clearDrafts: boolean = true) => {
    if (clearDrafts && user?.id) {
      // Fire-and-forget — logout shouldn't block on this, and the
      // synchronous public signature stays unchanged for every existing
      // caller throughout the app that doesn't await it.
      mockDraftCacheService.clearAllDraftsForUser(user.id);
    }
    // Only clear the shared active-session marker if it still points to
    // THIS tab's own session. If this tab has already been superseded by
    // a newer login elsewhere, the marker correctly points to that other,
    // still-active session now — clearing it here would incorrectly log
    // that other session out too, right after it just logged in.
    if (user?.id) {
      const ownId = getOwnSessionId();
      if (ownId && getActiveSessionId(user.id) === ownId) {
        clearActiveSessionId(user.id);
      }
      clearOwnSessionId();
    }
    saveUser(null);
  };

  const updateUserProfile = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      saveUser(updatedUser);
    }
  };

  // Real fix: closing the tab/window (not an explicit logout) never
  // cleared the shared active-session marker, only logout() did. That
  // meant relaunching the app shortly after simply closing it (not
  // logging out first) found the previous session's still-there marker
  // and incorrectly reported a conflict with "another tab," even though
  // that tab was genuinely gone. beforeunload can't await anything, so
  // this mirrors just the synchronous marker-clearing half of logout()
  // above, not the draft-clearing half — a closed tab's drafts should
  // still be there to restore, same as an idle-timeout logout already
  // preserves them.
  useEffect(() => {
    if (!user?.id) return;
    const handler = () => {
      const ownId = getOwnSessionId();
      if (ownId && getActiveSessionId(user.id) === ownId) {
        clearActiveSessionId(user.id);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [user?.id]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      // No stored session — show login immediately
      setLoading(false);
      return;
    }

    const restoreSession = async () => {
      try {
        const parsed = JSON.parse(stored);

        // Ensure voiceProfile always has a fallback
        if (!parsed.voiceProfile) parsed.voiceProfile = 'EN-US';

        // Resolve canViewPediatric/canViewOrchestration/
        // canAccessCrossTenantQa/organisationId if missing from stored
        // session (covers a brand-new field on an old stored session).
        // organisationId is included here deliberately —
        // without it, a session logged in before this change would keep
        // its old canViewPediatric/canViewOrchestration and never get
        // organisationId backfilled, silently locking that session out of
        // all case access until a fresh login.
        if (parsed.canViewPediatric === undefined || parsed.canViewOrchestration === undefined || parsed.canAccessCrossTenantQa === undefined || parsed.organisationId === undefined) {
          const fields = await resolveStaffFields(parsed.id);
          Object.assign(parsed, fields);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }

        setUser({ ...parsed });
      } catch (e) {
        console.error('Failed to restore session:', e);
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        // Always clear loading — whether restore succeeded or failed
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
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
// File-by-file cleanup sweep: consolidates two independently-duplicated,
// independently-bug-prone copies of this exact check.
// ConfigurationPage.tsx used to read its own localStorage.getItem
// ('pathscribe-user') + JSON.parse, duplicating exactly what this context
// already does under the same storage key; Config/AI/index.tsx's own copy
// had the same bug pattern for real (read the wrong storage key entirely —
// 'pathscribe_current_user' instead of this context's real 'pathscribe-user'
// — so isAdmin there was always false for every real user until that was
// caught and fixed locally). Reading useAuth()'s already-parsed user.role
// here means there is exactly one source of truth for "is this user an
// admin," not two (or more) that can silently drift or regress.
//
// "Admin-tier" here is the broader set used for gating whole admin surfaces
// (admin, pathologist-admin, or superadmin) — deliberately broader than
// roleHas()'s own "admin" check above, which folds pathologist-admin into
// "pathologist" checks but not "admin" ones. See roleHas's own doc comment.
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return !!user && ['admin', 'pathologist-admin', 'superadmin'].includes(user.role);
}

export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === 'superadmin';
}

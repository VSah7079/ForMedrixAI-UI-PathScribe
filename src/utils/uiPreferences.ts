// src/utils/uiPreferences.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 330: the one place UI code keeps per-user display preferences in the
// browser — a collapsed sidebar, a preview's page size, a chosen tab. They
// belong to this browser and never need the backend.
//
// Anything that is data (report drafts, annotations, requests, settings
// other users or the audit trail depend on) must go through a service
// instead, so it reaches the real backend when there is one. The
// deployment-readiness guard (services/deploymentReadiness/) stops UI code
// from using browser storage directly.
//
// Every access is wrapped: private browsing, blocked storage or a full
// quota fall back to the default rather than throwing.
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX = 'ps_ui_';

export function getUiPreference<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function setUiPreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the preference just isn't remembered */
  }
}

export function clearUiPreference(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

// Batch 375: per-tab flags that last only for this browser session
// (sessionStorage), read and cleared under the exact key another screen set,
// e.g. 'ps_reopen_messages' (AppShell sets it when a message opens a case, so
// the report page can offer "back to messages").
export function getSessionFlag(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function clearSessionFlag(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

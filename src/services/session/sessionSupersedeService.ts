// src/services/session/sessionSupersedeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Same-browser, multi-tab session-supersede detection. When the same user
// logs in again in a second tab, the first tab should be warned and logged
// out — with unsaved drafts preserved, not discarded, matching the same
// "Timeout Preservation" rule Phase 2's draft-cache spec already
// established for idle-timeout logout (see IDraftCacheService.ts).
//
// Deliberately localStorage (shared across same-origin tabs) for the
// active-session marker, and sessionStorage (genuinely per-tab) for each
// tab's own identity — that split is what makes the native `storage` event
// work correctly here: it fires in every OTHER tab when localStorage
// changes, but never in the tab that made the change itself, so a tab can
// never falsely detect itself as superseded by its own login.
//
// Explicitly scoped to same-browser/same-device. True cross-device session
// invalidation (a phone and a laptop, or two different browsers) needs a
// real shared backend to signal across — see
// backend-requirements-concurrency-security.md's cross-device session
// item. This is the real, working subset of the problem that doesn't need
// that.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_SESSION_KEY_PREFIX = 'pathscribe_active_session_';
const OWN_SESSION_ID_KEY = 'pathscribe_own_session_id';

export function activeSessionKeyFor(userId: string): string {
  return `${ACTIVE_SESSION_KEY_PREFIX}${userId}`;
}

export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** What's recorded, shared across every tab on this browser, as the
 *  currently-active session for a given user. */
export function getActiveSessionId(userId: string): string | null {
  try { return localStorage.getItem(activeSessionKeyFor(userId)); } catch { return null; }
}

export function setActiveSessionId(userId: string, sessionId: string): void {
  try { localStorage.setItem(activeSessionKeyFor(userId), sessionId); } catch {}
}

/** Called on ANY logout (explicit or idle-timeout) — without this, a
 *  perfectly normal future login would incorrectly detect a "conflict"
 *  against a stale marker nobody ever cleared. */
export function clearActiveSessionId(userId: string): void {
  try { localStorage.removeItem(activeSessionKeyFor(userId)); } catch {}
}

/** This specific tab's own session identity — sessionStorage, not
 *  localStorage, so it's genuinely per-tab, not shared. */
export function getOwnSessionId(): string | null {
  try { return sessionStorage.getItem(OWN_SESSION_ID_KEY); } catch { return null; }
}

export function setOwnSessionId(sessionId: string): void {
  try { sessionStorage.setItem(OWN_SESSION_ID_KEY, sessionId); } catch {}
}

export function clearOwnSessionId(): void {
  try { sessionStorage.removeItem(OWN_SESSION_ID_KEY); } catch {}
}

// ─── The "you were signed out because you signed in elsewhere" notice ───────
// PS-60 (Batch 343): moved here from ProtectedRoute and LoginPage, which
// used sessionStorage directly. ProtectedRoute flags it as it signs the
// superseded tab out; LoginPage shows it once on arrival.

const SUPERSEDED_NOTICE_KEY = 'pathscribe_show_superseded_notice';

export function flagSupersededNotice(): void {
  try { sessionStorage.setItem(SUPERSEDED_NOTICE_KEY, '1'); } catch {}
}

/** True once after flagSupersededNotice(), then false. */
export function consumeSupersededNotice(): boolean {
  try {
    if (sessionStorage.getItem(SUPERSEDED_NOTICE_KEY) !== '1') return false;
    sessionStorage.removeItem(SUPERSEDED_NOTICE_KEY);
    return true;
  } catch {
    return false;
  }
}

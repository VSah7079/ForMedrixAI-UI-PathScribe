# services/session/

Two real, related things live here: **idle-session-timeout resolution**
(Phase 1 of the Inactivity Timeout & Draft Recovery feature, full spec in
`PRIORITY_FIXES.md` #13) and **same-browser session-supersede detection**
(added when the same user logs in from a second tab — see below).
They're related but distinct: idle-timeout answers "how long since the
user did anything," session-supersede answers "did I just get replaced by
a newer login." Both feed into the same real consequence — a forced
logout via `ProtectedRoute.tsx` that preserves drafts, never discards
them (`logout(false)`, per `IDraftCacheService.ts`'s Timeout Preservation
rule).

**Pattern:** Standard interface/mock/firestore-stub pattern for the
idle-timeout piece — matches this codebase's established convention
exactly. The session-supersede piece is deliberately NOT a service/mock/
firestore triplet — it's real, working browser-native functionality
(`localStorage` + the native `storage` event) with zero backend
dependency, so there's nothing to swap for a Firestore implementation
later; see its own section below for why.

**Correction, worth stating plainly:** the first version of this folder
was a single, non-conforming file (`sessionTimeoutConfig.ts`) with bare
exported functions instead of a real service object implementing an
interface — modeled on `components/Config/AI/orchestratorModeConfig.ts`'s
org-default/per-client-override *shape*, but that file lives in
`components/`, not `services/`, and was never held to this folder's
actual convention. Caught by Pete, restructured properly before it
became a second precedent for future folders to copy incorrectly.

## Files — idle-timeout resolution

- **`ISessionTimeoutService.ts`** — `getOrgDefault()`/`setOrgDefault(minutes)`
  (org-wide default) plus `resolveEffectiveMinutes(orderingFacilityId?)`
  (full resolution — resolves through `resolvePerformingLabFacilityId()`
  (`services/facilities/IFacilityService.ts`) to whichever facility
  actually performs the work on the currently-open case, same as every
  other lab-scoped setting in this codebase, e.g.
  `Facility.internalAiOrchestratorEnabled`). All three
  methods return the standard async `ServiceResult<T>`. Also exports
  `extractCaseIdFromPath()` as a plain function alongside the interface
  (not part of it) — pure string parsing, no data access, so it doesn't
  belong to either the mock or firestore implementation specifically;
  both would need it identically. Lets the consuming hook
  (`hooks/useIdleTimeout.ts`) detect "is a specific case currently open"
  from the URL without needing case context threaded through
  `ProtectedRoute.tsx` (which wraps every authenticated route equally and
  has no built-in awareness of this).
- **`mockSessionTimeoutService.ts`** — localStorage-backed implementation
  (`pathscribe_idle_timeout_minutes` key for the org default).
  `resolveEffectiveMinutes` falls back to the org default whenever no
  client can be resolved (no case open, missing id, lookup failure, or no
  override set on the performing lab) — fails safe toward the *stricter*
  value, not an unbounded session.
- **`firestoreSessionTimeoutService.ts`** — Stub only, matching this
  codebase's established minimal convention exactly (a comment-only
  placeholder marking future backend cutover) — see
  `services/specimenDictionary/firestoreSpecimenDictionaryService.ts`
  for the identical pattern this was modeled on.

## Files — session-supersede detection (added this session)

Real, working same-browser/multiple-tab detection: the same user logging
in from a second tab correctly warns and, if confirmed, signs the first
tab out with drafts preserved. Explicitly does NOT cover cross-device or
cross-browser sessions (a phone and a laptop can't signal each other
without something shared between them) — that's real, separate,
backend-dependent follow-on work, tracked in
`backend-requirements-concurrency-security.md` §9.

- **`sessionSupersedeService.ts`** — The real storage primitives, and the
  ONLY file here without an interface/mock split, deliberately: this is
  genuine browser-native functionality (`localStorage` for the shared,
  cross-tab active-session marker; `sessionStorage` for each tab's own
  identity), not a data source that will ever need a Firestore
  implementation to swap in — the whole mechanism only works because
  same-origin tabs can already talk to each other via `localStorage`,
  which has no backend equivalent to "cut over" to. Exports
  `generateSessionId()`, `getActiveSessionId`/`setActiveSessionId`/
  `clearActiveSessionId` (the shared, per-user marker — key format
  `pathscribe_active_session_{userId}`), and `getOwnSessionId`/
  `setOwnSessionId`/`clearOwnSessionId` (this tab's own identity).
- **`sessionSupersedeService.test.ts`** — Real tests against a working
  in-memory `localStorage`/`sessionStorage` stub (this test environment
  is plain Node, no browser storage natively) — 6 tests covering
  per-user scoping, the null-when-nothing-set case, and that clearing one
  user's marker never touches another's.

**Consumers, not part of this folder:**
- **`hooks/useSessionSupersedeDetection.ts`** — the hook that actually
  listens for the native `storage` event and reports `superseded:
  boolean`, mirroring `useIdleTimeout.ts`'s shape so `ProtectedRoute.tsx`
  handles both the same way.
- **`contexts/AuthContext.tsx`** — `login()` now returns
  `'success' | 'invalid_credentials' | 'session_conflict'` instead of a
  plain boolean, checks for an existing active session before completing
  login, and establishes this tab's own session identity on success.
  `logout()` only clears the shared marker if it still points to THIS
  tab's own session — a superseded tab's logout must never wipe out the
  newer session's legitimate marker.
- **`components/Common/SessionSupersededNotice.tsx`** — the real notice
  shown on `LoginPage.tsx` after a superseded logout (rendered there, not
  in `ProtectedRoute.tsx`, since that component unmounts and redirects
  the instant `logout()` runs — a modal there would never actually be
  seen).

## Batch 343 (PS-60)

- **`flagSupersededNotice()` / `consumeSupersededNotice()`** (in `sessionSupersedeService.ts`): the "signed out because you signed in elsewhere" marker. It moved here from `ProtectedRoute.tsx` and `LoginPage.tsx`, which used sessionStorage directly.
- **The markers are now driven by `services/auth/authSession.ts`** (start, end and restore of a session) instead of `AuthContext`. Restoring a session after a reload now takes the active-session marker back if no other tab holds it. Before, one reload released it for good, and a second tab's sign-in was no longer reported as a conflict.

## Notes

- **Idle-timeout deliberately resolves per single currently-open case**,
  not a multi-institution "strictest among all active permissions" model
  — matches PathScribe's actual single-case-focused UI (one case fully
  open at a time), and avoids inventing a user-to-client permissions
  concept that doesn't exist anywhere in the current data model. This
  was a real design decision, not an oversight — see `PRIORITY_FIXES.md`
  #13 for the fuller reasoning (Model 1/2/3 tradeoffs considered).
- **A real, separate bug was found and fixed in `useIdleTimeout.ts`
  itself** (not this folder, but worth noting here since it's the
  consuming hook): background-tab timer throttling could silently defeat
  the whole idle-timeout security control — a `setInterval`-based
  countdown can get paused by the browser while a tab is backgrounded,
  meaning a user who stepped away with the tab minimized could return to
  find the countdown never actually reached zero. Fixed by anchoring to
  absolute timestamps (`Date.now()`) and rechecking on the
  `visibilitychange` event, rather than trusting however many timer ticks
  happened to fire while backgrounded.
- Real, working admin UI exists for both layers: org default at
  Configuration → System → Session Security
  (`components/Config/System/SessionSecuritySection.tsx`); per-facility
  override on Facility Configuration's edit modal, AI & Performance tab
  (`Facility.idleTimeoutMinutesOverride`, `components/ClientDictionary/ClientEditorModal.tsx`).
  No equivalent admin UI exists yet for session-supersede — there's
  nothing to configure, it's always-on browser-native behavior.
- Consumed by `hooks/useIdleTimeout.ts` (idle-timeout) and
  `hooks/useSessionSupersedeDetection.ts` (session-supersede) — the files
  that actually own their respective detection logic; this folder is
  purely the underlying resolution/storage logic each hook builds on.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

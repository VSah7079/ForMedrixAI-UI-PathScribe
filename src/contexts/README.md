# src/contexts/

App-wide React state — auth, messaging, voice, system config, scanner
input, dirty-state/navigation guards, breadcrumbs. Every file here is a
`createContext` + provider + hook triplet (`useAuth`, `useMessaging`,
etc.), consumed from many places across `pages/`/`components/`.

## Files

- **`AuthContext.tsx`** — session/login state, the hardcoded demo
  credentials list, and `resolveStaffFields` (backfills
  `canViewPediatric`/`canViewOrchestration`/`canAccessCrossTenantQa`/
  `organisationId` from the real `StaffUser` record at login and on
  session restore — deliberately fail-safe: any resolution failure
  defaults every one of these to `false`/absent rather than granting
  access). Real, thoughtful reasoning throughout (the `forceSupersede`
  three-outcome login result, the session-supersede-vs-explicit-logout
  distinction in `logout()`, the organisationId backfill comment
  explaining why a stale stored session would otherwise get silently
  locked out of all case access). Cleaned up this pass: a debug
  `console.log` that fired on every real login attempt (logging email
  + password length) removed; `resolveStaffFields`'s `.find((u: any)
  => ...)` was making `staffUser` implicitly `any`, which had produced
  an inconsistent mix — 4 fields read off it had a redundant `as any`
  layered on top of the already-`any` value, 5 didn't, no functional
  difference, just misleading. Fixed the root cause (typed the `.find`
  properly) and removed all 4 redundant casts. One more unnecessary
  cast on `voiceProfile` removed — traced `VoiceProfileId`'s real
  definition and confirmed it's just `string` underneath, no cast ever
  needed.

- **`MessagingContext.tsx`** — unread count, urgent-flag audio alert,
  drawer open/closed (persisted to `sessionStorage`), inbox polling
  every 20s plus a reload-on-tab-visible listener. Found and fixed one
  real, small duplication: `setPortalOpen` already persists to
  `sessionStorage` synchronously on every call, but a separate
  `useEffect` also wrote the identical value on every `portalOpen`
  change — confirmed via grep that nothing else could change
  `portalOpen` without going through `setPortalOpen` first, so the
  effect was pure redundancy. Removed.

- **`ScannerProvider.tsx`** — global HID barcode/QR scanner listener,
  distinguishing scanner input from human typing by inter-keystroke
  timing. Careful, well-reasoned edge-case handling (guards against
  synthetic/extension key events, never consumes Enter when a form
  element has focus, distinguishes a slow scanner start from genuine
  human typing). One real bug found and fixed: a keydown handler had
  `if (window.location.pathname === '/' && !user) return;` intended,
  per its comment, to skip the login page — dead on two counts. The
  whole effect is already gated one level up by `if (!user) return`,
  so `!user` here was always `false` by the time this line could run;
  separately, `App.tsx`'s routing shows `/` is actually the Home page,
  not login. Removed — the outer guard already provides the real
  protection.

- **Real feature, per direct, detailed specification: "Barcode Listener
  & Form Auto-Ingestion."** A real conflict found and fixed while
  wiring it in: `handleScan()`'s own, existing auto-navigation
  (`navigate('/case/{accession}/synoptic')` on an accession-pattern
  match) fired globally, with no route awareness — including on
  `pages/AccessionPage/AccessionPage.tsx`, which now has its own,
  real, more specific handling for the exact same event (see that
  file's own README for the full feature). An accessioner scanning a
  brand-new specimen label whose payload happened to also match a
  configured accession-number pattern would have been yanked off the
  very page they were using to create the case, mid-scan. Fixed by
  suppressing the navigation specifically on `/accession` (via
  `useLocation()`, new) — the real `PATHSCRIBE_SCAN` event this file
  already dispatches on every successful scan still fires
  unconditionally either way; only the navigation side effect is
  route-gated.

- **`SystemConfigContext.tsx`** — three independently-persisted config
  layers (system/enterprise/hospital) with a documented override
  hierarchy (`isFeatureEnabled`: hospital → enterprise → false). Clean,
  well-organized. One unnecessary `(import.meta as any).env` cast
  removed — `import.meta.env.X` is read directly without casting
  elsewhere in this codebase.

- **`VoiceProvider.tsx`** (550+ lines, the largest file here) — the
  full voice command/dictation state machine: command-vs-dictate
  phase, AI-assisted refinement with a race-against-timeout fallback to
  local punctuation/capitalization, a small per-user dictation
  correction-learning store (`localStorage`-backed), missed-command
  shortcut-confirmation window. A lot of `useRef` mirrors of state
  (`phaseRef`, `commandPhaseRef`, `aiAvailableRef`, etc.) — a
  legitimate, standard pattern here, not a smell: they exist so the
  speech-recognition event handlers (registered once, long-lived
  closures) can read current values without stale-closure bugs, not
  duplicated state. **Real fix, later pass:** "AI refinement" was
  previously hardcoded to a literal `'gemini-2.0-flash-lite'` string,
  calling Gemini directly via its own raw fetch — completely
  disconnected from the rest of the app's AI infrastructure. Both the
  availability probe and the actual refinement call now resolve the
  real active `AIModel` (`type: 'Voice Dictation'`, see
  `services/models/README.md`) and route through the same multi-vendor
  `callAi()` the rest of the app uses — genuinely vendor-agnostic now,
  governed by the same validation-study hard-block as report models.
  Cleaned up this pass:
  - `isProcessing` and `setIsAiEnabled` were both part of the public
    `VoiceContextType` — one a hardcoded `false` literal, the other a
    literal no-op `() => {}` that silently discarded whatever caller
    passed in. Traced every consumer (`usePathscribeSpeech.ts`
    re-exports `isProcessing`; nothing downstream of that ever reads
    it — `SpeechConfigTab.tsx`, its only consumer, doesn't reference
    it at all) — confirmed genuinely dead on both ends, not just
    unused-but-reachable. Removed from the interface, the value
    object, and `usePathscribeSpeech.ts`'s re-export.
  - `window.__psRecordDictationCorrection` (a genuine global
    side-channel, not a mistake) had 3 separate `(window as any)`
    casts. Unlike `SpeechRecognition`/`webkitSpeechRecognition` a few
    lines below — which really have no TypeScript DOM lib type, and
    correctly keep their `any` here (confirmed no
    `dom-speech-recognition`-style package is installed or reachable
    in this sandbox) — this one was properly fixable: added a
    `declare global { interface Window { ... } }` block once, removed
    all 3 casts.
  - Removed a debug `console.log` that fired on every real dictation
    correction in production. Left the file's several `console.warn`
    calls alone — those report genuine failures (an AI refinement fetch
    failing, the proxy returning a bad status, a speech-recognition
    error), not debug noise.

  **Real addition ("Personal Quick Text" — Enterprise then Facility
  then Staff), per direct guidance:** the real spoken-trigger
  substitution algorithm already existed (`MockVoiceMacroService.
  refineTranscript()`, `services/voicemacro/`) but had zero real call
  sites anywhere in the app, confirmed directly before wiring this —
  it was correct and complete, just never invoked from the live
  dictation pipeline. Now genuinely wired in: the algorithm was
  extracted into a pure, synchronous `applyVoiceMacroSubstitutions()`
  (`types/voiceMacros.ts`, shared by `refineTranscript()` itself so the
  two can't drift apart) and applied inside `handleDictationSegment`'s
  own real LOCAL PATH — right after punctuation/learned-corrections,
  before the AI-refinement/direct-insertion branch, so a spoken trigger
  expands the same way regardless of whether AI refinement also runs
  afterward. Filtered per-segment to exactly the real macros the
  current session user can see (`isVoiceMacroVisibleTo()`) for
  whichever real facility the current `DictationTarget` belongs to.
  `DictationTarget` gained `performingLabFacilityId?` for this —
  `OrchestratorSectionEditor.tsx`'s own `registerDictationTarget`
  passes through the case's own already-resolved performing lab, same
  value its "QT" (Personal Quick Text) button already uses. The active
  macro list is refreshed once per real dictation session
  (`startDictation`), not per spoken segment — this needed to stay
  near-instant, not add a fetch to every utterance.

- **`BreadcrumbContext.tsx`** — simple push/pop breadcrumb stack for
  the nav bar. Clean, no issues.

- **`DirtyStateContext.tsx`** / **`DirtyStateProvider.tsx`** — looked
  like a possible duplication at first glance (two similarly-named
  files), but this is a legitimate, standard split: the former defines
  just the context object, default value, and `useDirtyState` hook;
  the latter is the actual stateful provider implementation
  (`requestNavigate`/`confirmNavigate`/`cancelNavigate` — the
  "unsaved changes, are you sure you want to leave" guard used
  throughout the app). No issue.

## Real bug found and fixed separately — see `PRIORITY_FIXES.md` items #31/#32

The most significant finding from this folder wasn't in any of the
files above — it was a file that's now deleted.
`contexts/useSubspecialties.tsx` was a second, entirely disconnected
"subspecialties" data source: hardcoded, in-memory-only, 2 entries,
never persisted, with different IDs than the real, proper
`subspecialtyService` (interface/mock/real triplet, 9 entries,
actually persisted) used everywhere else in the app. The admin screen
for managing subspecialties (`SubspecialtiesSection.tsx`) was reading
and writing through this fake context — meaning any subspecialty an
admin added or edited silently vanished on refresh, with zero effect
on routing, FPPE assignments, case pooling, or anything else that
actually used the real service. Five other screens were all showing
an incomplete list as a result. Migrated all 6 consumers onto the real
service, removed the `<SubspecialtyProvider>` wrapper from `App.tsx`,
deleted the file. Full writeup in `PRIORITY_FIXES.md` item #31; the
rest of this folder's smaller findings are item #32.

# src/hooks/

Reusable stateful logic used across pages/components — session
timeout, draft caching, screen capture, companion windows, voice,
audit logging, and a few smaller single-purpose hooks.

## Files

- **`useIdleTimeout.ts`** — session inactivity warning/expiry
  countdown. Genuinely excellent: correctly handles background-tab
  `setTimeout`/`setInterval` throttling by re-deriving state against
  `Date.now()` on tab-visibility-change rather than trusting however
  many ticks a throttled timer happened to fire, and carefully avoids
  a stale-closure bug (a ref mirrors `showWarning` specifically so the
  activity listener — registered once, not on every warning-state
  toggle — always reads the current value). One unnecessary `any`
  cast removed (`caseData?.order?.clientId` — `caseRouter.getCase()`
  already returns a properly typed `Case | undefined`).

- **`useDraftCache.ts`** — debounced draft auto-save +
  restore-on-mount, backing the Inactivity Timeout & Draft Recovery
  spec. **Real, severe bug found and fixed** — per direct report,
  "timeout worked, but no restore dialog appeared on re-entry."
  Reproduced precisely: the underlying service call always succeeded
  at finding the draft, but a redundant `checkedKeyRef` guard (meant
  to prevent re-checking, already handled correctly by this effect's
  own dependency array) actively broke React 18 Strict Mode's mount →
  cleanup → re-mount cycle — this app's real root (`main.tsx`) renders
  inside `<React.StrictMode>`. The first invocation started the real
  `getDraft()` call and set the ref; Strict Mode's cleanup marked that
  same closure `cancelled`; the second, surviving invocation saw the
  ref already set and skipped calling `getDraft()` again entirely; the
  first call's promise then resolved successfully but was discarded
  because its own closure had been cancelled. The draft was being
  found and silently thrown away on every single re-entry. Fixed by
  removing the redundant guard. Verified the fix is real, not just
  compiled: reproduced the bug live with a genuinely injected draft
  first, confirmed the modal failed to appear, fixed it, confirmed the
  identical reproduction now works end-to-end (including clicking
  Restore), then proved the new regression test
  (`useDraftCache.test.ts`) actually catches this specific bug by
  temporarily reintroducing it and confirming exactly the
  Strict-Mode-rendered test case fails. `confirmRestore`/`discardDraft`
  are currently identical implementations but semantically distinct
  actions from the caller's perspective — left as two separate
  functions rather than merged, since collapsing them would cost
  future extensibility (e.g. logging restore vs. discard rates
  separately) for no real benefit today.

- **`useScreenCapture.ts`** — PHI-redacted screenshot capture for the
  Enhancement Request support-ticket modal. **Found and fixed the
  most serious issue in this whole review — see `PRIORITY_FIXES.md`
  item #34.** The `html2canvas` capture's `ignoreElements` option
  excluded the PHI redaction overlay divs themselves from the render,
  which (confirmed by reading `html2canvas`'s own clone-tree logic,
  and then confirmed *empirically* with an isolated reproduction
  rendered through the real library) meant the overlay never actually
  painted — the real PHI content underneath, a separate DOM node the
  overlay was never attached to, rendered fully visible in every
  captured screenshot. Fixed and re-verified with the same empirical
  method, not just re-compiled. One more small cleanup alongside it:
  `catch (err: any)` changed to the `unknown`-plus-cast pattern already
  established elsewhere in this codebase.

- **`useCompanionWindow.ts`** — the "keep a reference window open
  alongside the app, reuse it across clicks, remember where the user
  dragged it" hook (Clinical Links, PubMed ticker). Two `any` casts on
  `getScreenDetails()` (the Window Management API) are correctly
  left as-is — confirmed no TypeScript DOM lib type exists for this
  API, same situation as `SpeechRecognition` in `VoiceProvider.tsx`.

- **`usePreviewChannel.ts`** — **removed entirely, see
  `PRIORITY_FIXES.md` item #33.** Implemented a real, sophisticated
  cross-window live-preview system (BroadcastChannel sync,
  window-geometry persistence, popup-blocked handling) whose sender
  half had zero consumers anywhere in the app. Traced what actually
  serves the two things it was meant to do — printing
  (`SynopticReportPage.tsx`'s own working `handleOrchPrint`, a real
  server-PDF-plus-fallback mechanism) and live-updating preview while
  editing (`SynopticReportPage.tsx`'s inline `ReportPreviewRenderer`,
  updating automatically via ordinary React re-rendering, no
  cross-window messaging needed) — confirmed with Pete this was
  superseded, dead architecture, and removed along with
  `ReportPreviewPage.tsx`, the `/report-preview/:caseId` route, and a
  dormant event listener that could never fire once the only thing
  that dispatched its event was gone.

- **`usepathscribeSpeech.ts`** — thin, intentionally-narrow wrapper
  over `VoiceProvider`'s full context (see
  `contexts/VoiceProvider.tsx`). Documents itself as "the primary hook
  for all voice interactions across the app," but only 1 of 9 actual
  voice-consuming files uses it — the other 8, including
  `OrchestratorSectionEditor.tsx` (exactly where the wrapper's own
  usage example says dictation happens), call `useVoice()` directly
  instead. Not a bug — both paths correctly read the same underlying
  context — but a real, confirmed drift between documented and actual
  usage. Flagged rather than force-migrated, since some of those 8
  files clearly need fields the narrower wrapper doesn't expose
  (`accent`, `voiceEnabled`, `aiAvailable`). Removed its `isProcessing`
  re-export as part of `VoiceProvider.tsx`'s own dead-code cleanup
  (see `contexts/README.md`).

- **`useSynopticAudit.ts`** — wraps `logEvent()` +
  `sendSynopticNotification()` for synoptic template audit events. The
  hook itself was clean (one unnecessary `any` cast removed — the
  notification service already accepts `SynopticAuditEvent` directly).
  Its only real consumer, `TemplateRenderer.tsx`, had a more
  significant issue: **every real field-edit audit call
  (`set_single_answer`, `set_text_answer`, both multi-answer variants,
  and the lifecycle-transition notification) omitted `user` entirely**,
  meaning every one of them fell through to this hook's hardcoded
  `DEFAULT_USER = 'Dr. Reviewer'` fallback — real edits by real
  pathologists were being logged under a fake placeholder name in a
  compliance-relevant audit trail. `TemplateRenderer.tsx` already had
  the real user resolved and available (`currentUser`, derived from
  `useAuth()`, already correctly used two lines below for a *different*
  call) — just never threaded through to these specific calls. Fixed
  by passing `user: currentUser` to all four. Found and removed 9
  more unnecessary `any` casts in the same file while there (every
  action-string literal genuinely matches the real
  `SynopticAuditAction` union — confirmed by reading the full type,
  not assumed), and one inconsistent duplicate fallback string
  (`user?.name ?? 'Dr. Reviewer'` re-derived inline a few lines below
  the already-correct `currentUser` variable) consolidated to reuse
  the existing one.

- **`useTerminologyAlerts.ts`** — debounced SNOMED/ICD
  deprecated-code scanning for the synoptic template editor. Clean.

- **`useSessionSupersedeDetection.ts`** — detects same-user login from
  another tab via the native `storage` event (which the browser
  correctly never fires in the tab that made the write, avoiding any
  self-triggered false positive). Small, clean, correct.

- **`useFocusTrap.ts`** — WCAG 2.1 SC 2.1.2 keyboard focus trap for
  modals. The hook itself is correct and clean. Worth flagging: only
  one component in the entire app (`FlagConfigPage.tsx`) actually uses
  it, despite dozens of modals existing across the codebase. Not
  confirmed as a gap — verifying that would mean auditing every modal
  individually, out of scope for this pass — but worth a dedicated
  look given the WCAG relevance.

- **`useLogout.ts`**, **`useLatestResearch.ts`** — small, clean,
  properly adopted (5 and 1 consumers respectively, no bypasses
  found).

## Scan station & material scanning (Aug 2026)

- **`useCurrentScanStation.ts`** — real, per-device/per-browser
  station setting (`localStorage`, deliberately not part of any Case
  or user record) — the real, physical terminal at "Grossing Station
  3" stays configured as that station regardless of which tech logs
  in and works there during a given shift; a tech switching benches
  switches this setting, not their own profile. Real bug found and
  fixed while live-verifying the scan pipeline end to end.
- **`useEffectiveScanStation.ts`** — a real, separate, higher-level
  hook implementing the fallback chain during session initialization
  (device storage → user profile default → none), deliberately kept
  separate from `useCurrentScanStation.ts` so that hook's own
  `stationId` stays exactly what it already is: the real, explicit,
  device-persisted value set only by a genuine user action.
- **`useGlobalMaterialScanTracking.ts`** — real fix, per direct
  follow-up: "the tracking event should occur no matter what page
  you're on in PathScribe." The original `useMaterialScanTracking.ts`
  (`SynopticReportPage/hooks/`) only listened while a specific case's
  own Synoptic page was mounted — a tech scanning a cassette from the
  Worklist, Search, or any other page was silently ignored, even
  though `ScannerProvider`'s own `PATHSCRIBE_SCAN` event is already
  genuinely global (window-level, mounted once at the app root).
- **`useGlobalStationSwitch.ts`** — real feature: "MVP Station-Switching
  via Barcode Label" — detects the `STATION:` prefix from the scanner
  input stream and triggers a station switch, even mid-dictation or
  mid-grossing. A real, separate listener from
  `useGlobalMaterialScanTracking.ts` — deliberately two independent
  listeners on the same real, global `PATHSCRIBE_SCAN` event rather
  than one listener trying to disambiguate both concerns. Has its own
  dedicated test file, `__tests__/useGlobalStationSwitch.test.ts` —
  safety-critical guardrail logic (never switches station mid-write).

## Foot pedal & audio (Aug 2026)

- **`useFootPedal.ts`** — real feature: "Foot pedal support
  specifically (the one part confirmed to not exist at all)." Detects
  both real HID/Gamepad-class pedals (via the Gamepad API's
  animation-frame poll loop — it has no "button pressed" event, so
  polling is the standard, only way to read live button state) and
  keyboard-emulating pedals (a common, simpler approach many pedal
  vendors use instead of true HID). Bindings are captured live from
  whatever hardware is actually connected — never a hardcoded guess
  at a specific pedal model's button index or keycode. Originally
  wired only into `SynopticReportPage.tsx`'s dictation controls.
  **Real fix (Sep 2026):** the same hook is now also called from
  `MicrotomyWorkstationPage.tsx` (Pedal 2 → Print/Etch Next) and
  `EmbeddingStationPage.tsx` (Pedal 1 → piece-count confirmation) —
  both pages had previously (incorrectly) disclaimed foot-pedal
  support as unreachable from a browser; each call site passes only
  the `actions` it actually uses, since a physical pedal is bound
  once per workstation, not per page. See
  `types/footPedal/README.md` for the full per-page action mapping.
- **`useAudioSegmentRecorder.ts`** — real feature, Foot Pedal 3
  ("Pause Audio / Replay Last Segment"). The existing dictation system
  (`VoiceProvider`, via the Web Speech API's `SpeechRecognition`) only
  ever returns transcribed text — never the raw audio — so "replay"
  had no real audio to replay from anywhere in this codebase before
  this. Deliberately a self-contained `MediaRecorder`-based recorder,
  kept independent from `VoiceProvider`'s own `SpeechRecognition`
  internals rather than deeply interleaved with them — lower risk than
  modifying that existing, working system.

## Cassette Engine integration (Aug 2026)

- **`usePendingEngineNotifications.ts`** — real, poll-based delivery of
  real, backend-raised Engine events (`api/webhooks/engine/` — see
  that folder's own README) to whichever technician's browser
  currently has the relevant case open. Poll, not `onSnapshot` —
  deliberate, matching this app's own existing convention (confirmed
  directly: no real-time Firestore listener exists anywhere else in
  this codebase). Dispatches by real event type: `cassette-dispatch-outcome`
  goes to the existing, unchanged `processCassetteDispatchOutcomeEvent`
  (the same function the Dev Tools "Sim" button already calls — that
  event never mutates a case, so one function safely serves both real
  and simulated flows). `block-exception`/`material-location` go to
  two new, deliberately notification-*only* siblings
  (`notifyBlockExceptionApplied`/`notifyMaterialLocationApplied`,
  `services/hl7/`) — **never** the mutation-performing
  `processBlockExceptionEvent`/`processMaterialLocationEvent` — because
  the real backend webhook has already applied that mutation
  server-side by the time a notification record exists to poll for;
  calling the mutating function here too would silently apply the
  same real change a second time.

  **Real, security-driven rewrite, mid-session**: originally marked a
  notification "done" by writing `consumed: true` back to Firestore
  from the client SDK. Removed entirely after direct review found this
  app has no real, server-verifiable session anywhere (`AuthContext.tsx`
  is a custom, `localStorage`-backed mock) — a Firestore rule can't
  distinguish a legitimate technician's write from anyone else's
  without one, so `pending_engine_notifications` needed to become
  `allow write: if false` for every real client. Replaced with a
  client-side-only `lastPolledAt` cursor (`where('createdAt', '>',
  lastPolledAt)`), advanced to when each poll *started*, not when it
  finished, so a notification created mid-poll isn't silently skipped.
  Real, disclosed consequence: nothing ever marks a document "done"
  anymore, so `pending_engine_notifications` grows unbounded until a
  real, separate, Admin-SDK-only cleanup job exists (not built).

## Real findings this pass, ranked by severity

1. **Draft recovery completely non-functional** (`useDraftCache.ts`) —
   confirmed and fixed. See `PRIORITY_FIXES.md` item #109. A React 18
   Strict Mode interaction silently discarded every found draft before
   it ever reached the UI — the entire Inactivity Timeout & Draft
   Recovery feature's core promise (don't lose a pathologist's unsaved
   work on session timeout) never actually worked. See this file's own
   entry above for the full mechanism.
2. **PHI redaction silently non-functional** (`useScreenCapture.ts`) —
   confirmed and fixed. See `PRIORITY_FIXES.md` item #34.
3. **Audit trail attributing real edits to a fake user**
   (`TemplateRenderer.tsx`, via `useSynopticAudit.ts`) — confirmed and
   fixed. See `PRIORITY_FIXES.md` item #32 (folded in alongside the
   contexts/ review since it was found while auditing that hook).
4. **Disconnected dead feature removed** (`usePreviewChannel.ts`) —
   confirmed with Pete and removed. See `PRIORITY_FIXES.md` item #33.
5. **Documented-vs-actual API drift**
   (`usepathscribeSpeech.ts`/`useVoice()`) — flagged, not fixed, not a
   bug.
6. **Possible focus-trap coverage gap** (`useFocusTrap.ts`) — flagged,
   not verified further, out of scope for this pass.

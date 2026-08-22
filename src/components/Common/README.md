# components/Common/

Shared, reusable UI primitives used across multiple pages.

## Files

- **`ConfirmModal.tsx`** — **MOVED HERE** (was
  `components/UI/ConfirmModal.tsx`, a whole folder that existed for this
  one file). Reusable dark confirmation dialog, explicitly meant to
  replace `window.confirm()` throughout the app. Genuinely used — the
  sole consumer, `Sidebar.tsx`, wires it to the real "Remove Synoptic
  Report" delete confirmation on the main case reporting page. `UI/` is
  now deleted (was already empty of anything else). See Notes for why
  this file matters beyond its own folder.
- **`InlineCommentThread.tsx`** — **MOVED HERE** (was
  `components/PatientReportPage/Comments/InlineCommentThread.tsx` — the
  page that folder was named for was deleted earlier this session as
  dead code, leaving this genuinely shared component sitting alone in a
  folder named after something that no longer existed). Per-field comment
  thread (add/resolve, audit-logged), used by
  `Config/Templates/TemplateRenderer.tsx`. No issues.
- **`SuffixSelect.tsx`** — Name suffix (Jr./Sr./II/III/IV/V) dropdown with
  free-text "Other…" fallback. Deliberately CSS-system-agnostic (takes
  className props rather than hardcoding classes) since it's reused across
  two different class systems (`ps-input-dark` on AccessionPage,
  `ps-conf-input` on Config screens). No issues.
- **`PatientIdStatusDot.tsx`** — real feature, per direct specification:
  "UI Status Indicator Component." A colored status dot next to a
  patient ID field, with a real, hoverable tooltip explaining the
  status — jurisdiction-aware (NHS Number's own real HL7 status code
  for England & Wales; locally-derived Green/Red elsewhere).
- **`LookupModal.tsx`** — Shared full-screen search-and-select modal shell
  (overlay, header, close-on-Escape/overlay-click), used across
  SearchPage's SNOMED/ICD-10/ICD-O/Specimen/Synoptic/Flags/Pathologist/
  Attending lookups. No issues.
- **`Dropdown.tsx`** — A minimal, genuinely custom single-select
  dropdown, built because a native `<select>`'s closed box can be
  restyled via CSS (see `.ps-conf-select`) but its *open* option list is
  OS-rendered and largely ignores CSS regardless of browser — no CSS-only
  fix exists once a native select is actually open. First real usage:
  `Config/Staff/StaffTab.tsx`'s "add a role" dropdown, which visibly
  looked inconsistent with the app's dark theme once opened. Deliberately
  simple (single-select, fires `onSelect` immediately, no search/keyboard
  nav) — extend if a future use case genuinely needs more, don't
  over-build ahead of need. ~36 other native `<select>` elements remain
  across `Config/System/` alone; this is the proof-of-concept, not a full
  sweep — logged as its own `PRIORITY_FIXES.md` item.
- **`SearchableCombobox.tsx`** — a genuine searchable combobox, real fix
  for item #69 ("Can the specimen type search be contains?"). `Dropdown.tsx`
  above is explicitly, deliberately a plain single-select with no search
  — this is its sibling for the cases that genuinely need filter-as-you-type
  over a longer option list, not a replacement for it.
- **`LogoutWarningModal.tsx`** — **MOVED HERE**, consolidating what were
  TWO separate implementations of the same "unsaved changes, log out
  anyway?" dialog: this one (was `pages/WorklistPage/LogoutWarningModal.tsx`)
  and a second one at `pages/SynopticReportPage/modals/LogoutWarningModal.tsx`
  with a genuinely different prop interface (`show`/`onCancel`/`onConfirm`
  vs. this one's `isOpen`/`onClose`/`onLogout`) and its own uncorrected
  `zIndex: 25000` bug. Consolidated specifically because
  `SynopticReportPage.tsx` is a critical, high-traffic file where two
  same-named components with different behavior is a real support-analyst
  confusion risk during an on-call situation, not just a style
  inconsistency — raised directly by Pete. All 3 real consumers
  (`WorklistPage.tsx`, `Home.tsx`, `SynopticReportPage.tsx`) now import
  this one component.
- **`SessionExpiryWarningModal.tsx`** — Phase 1 of the Inactivity
  Timeout & Draft Recovery feature (full spec in `PRIORITY_FIXES.md`) —
  the warning dialog shown before a real 15-minute idle timeout forces
  logout, wired via `src/hooks/useIdleTimeout.ts` and
  `src/ProtectedRoute.tsx`. Built after discovering that
  `services/auditlog/mockAuditService.ts` had two fabricated demo audit
  log entries claiming a "session expired after 60 min inactivity" event
  had actually fired successfully in the past — while no such mechanism
  existed anywhere in `AuthContext.tsx` at all. Those entries were
  removed immediately, before this real feature was even started.
  **Worth its own callout on the modal's copy:** the original feature
  spec's wireframe text ("Any unsaved changes will be safely cached on
  this device") describes Phase 2 (draft preservation) — at the time
  this modal was built, that didn't exist yet, so using that wording
  would have recreated the exact false-claim problem just removed from
  the audit log. Reworded to honestly reflect what existed at the time.
  **Phase 2 is now built (see `DraftRecoveryModal.tsx` below) — this
  modal's copy may be worth revisiting now that the claim is actually
  true**, not yet done, flagged for a follow-up pass.
- **`DraftRecoveryModal.tsx`** — **NEW.** Phase 2 (Step B) of the same
  feature — the recovery prompt shown when a cached draft exists for the
  case being opened. Wired into `SynopticReportPage.tsx` via
  `src/hooks/useDraftCache.ts` and `src/services/drafts/` (new
  `I`/`mock`/`firestore`-stub three-file service, matching this
  codebase's established convention — the first draft of this feature
  was a single non-conforming file, caught and corrected before anything
  depended on it). Deliberately simpler than the original spec's own
  wireframe (a full field-by-field diff with individual checkboxes):
  local-only restore (no auto-persist to the server), marks the case
  dirty via the page's existing `markDirty` mechanism, and lets the
  pathologist's normal Save Draft review serve as the actual
  verification step — no custom diff-rendering UI needed. Two real,
  substantive design corrections happened before landing on this final
  shape, both raised directly by Pete: (1) an earlier version only
  cached `synopticReports.answers` specifically — a full audit of this
  page's own `markDirty()` call sites found **18 distinct dirty-able
  things** (Priority, Flags, Case comments, Specimens, Codes, Report
  sequence, etc.), meaning that narrower version would have silently
  missed the large majority of real editable content; now caches the
  full case instead. (2) Caching the full case raised a real PHI
  question — the cached payload explicitly **excludes the `patient`
  object** (name/DOB/MRN), both for HIPAA minimum-necessary reasoning
  (unencrypted demographics at rest in `localStorage` is unnecessary
  risk — payload encryption is genuinely Phase 3, not built yet) and for
  data integrity (patient demographics are read-only master data from
  the LIS/EHR; restoring a stale cached copy over freshly-fetched current
  data would be a real correctness bug, not just a privacy one).
- **`SessionSupersededNotice.tsx`** — **NEW.** Shown on `pages/LoginPage.tsx`
  after a same-browser session-supersede logout (the same user signing
  in from a second tab). Deliberately rendered on the login page, not
  `ProtectedRoute.tsx` — that component unmounts and redirects to
  `/login` the instant `logout()` runs, so a modal shown there would
  never actually be seen. `ProtectedRoute.tsx` leaves a real marker
  (`sessionStorage`) that `LoginPage.tsx` checks for on arrival instead.
  Same "preserve drafts, never discard" guarantee as
  `SessionExpiryWarningModal.tsx`'s idle-timeout flow — a superseded
  logout calls `logout(false)`, not `logout(true)`. See
  `services/session/README.md` for the full mechanism this notice is the
  visible endpoint of.

- **`PubMedTicker.tsx`** — **NEW.** The research headline on the Home
  dashboard, replacing a static line of marketing copy. Presentation only:
  every piece of logic lives elsewhere (`services/research/` for fetching,
  sanitising, caching and rate-limit backoff; `hooks/useLatestResearch.ts`
  for the abort-on-unmount lifecycle; `utils/openReferenceWindow.ts` for the
  popup). This component renders what it is handed and returns `null` when
  there is nothing, which is also its entire failure mode — no feed, no
  network, no error surface.
  **Worth its own callout on the popup.** The feature spec claimed a sized
  `window.open` popup prevents reverse tabnabbing. It is the opposite: the
  child window gets a live `window.opener` reference back to the
  authenticated PathScribe session, which *is* the attack. Passing `noopener`
  in the features string does not fix it either — browsers that honour it
  return `null` and discard the width, height and position, so there is no
  sized popup at all. The reference has to be severed after opening
  (`popup.opener = null`), which is what `openReferenceWindow.ts` does; the
  anchor's `rel="noopener noreferrer"` remains as the fallback path. Also
  note the click handler only calls `preventDefault()` **if the popup
  actually opened** — enterprise browser policy blocks popups more often than
  consumer Chrome, and an unconditional `preventDefault()` would make the
  link silently do nothing. Modifier-clicks pass through untouched.

## Deleted this pass

- **`Button/Button.test.tsx`** — Confirmed empty scaffold (`export {};`,
  no actual test content), with no corresponding `Button.tsx` component
  anywhere in this folder or elsewhere. Never had real content — not a
  case of a test outliving its component, just an unfilled template file
  that was never cleaned up. `Common/Button/` is now an empty folder,
  worth deleting outright.

## Notes

- **RESOLVED:** `ConfirmModal.tsx` used to live in its own single-file
  folder, `components/UI/` — about as generic a name as possible,
  containing exactly one file. Moved here, next to `LookupModal.tsx` (the
  same category of thing — a shared modal shell), which is where it
  always should have been. `UI/` is deleted.
- **RESOLVED — PRIORITY_FIXES.md #8, modal-overlay shell consolidation,
  now fully closed across all 14 originally-identified files.** The
  pattern flagged here (`Common/LookupModal.tsx`/`Common/ConfirmModal.tsx`
  barely adopted despite being real, working shared solutions) turned
  into a complete sweep — see the top-level `components/README.md`'s
  Fixes Applied section for the full file list and what was found along
  the way, including two further real duplicate components
  (`LogoutWarningModal.tsx` above, and `Home.tsx`'s own separate copies
  of the Quick Links / Safety modals, eliminated by reuse rather than
  reformatted a third time).
- Methodology note, still relevant for future folders: "right file in
  the right place" includes checking for patterns reimplemented in many
  places that should be consolidated into a shared folder — not just
  whether an individual file's own location matches its dependency
  direction (the `specimenTypes.ts` class of check).
- **Scope boundary, worth stating explicitly:** this README tracks
  `components/Common/`'s own files only. `SessionExpiryWarningModal.tsx`/
  `DraftRecoveryModal.tsx` live here and are documented above, but their
  real dependencies (`hooks/useIdleTimeout.ts`, `hooks/useDraftCache.ts`,
  `services/drafts/`, root-level `ProtectedRoute.tsx`) fall outside any
  existing README system and are tracked in `PRIORITY_FIXES.md` instead,
  as do `PubMedTicker.tsx`'s (`hooks/useLatestResearch.ts`,
  `utils/openReferenceWindow.ts` — `services/research/` has its own README),
  not duplicated here.
- **A real bug in `hooks/useIdleTimeout.ts`** (the consumer of
  `SessionExpiryWarningModal.tsx` above) was found and fixed this
  session, worth knowing if this modal ever seems to not fire when
  expected: background-tab timer throttling could silently defeat the
  whole idle-timeout control — a `setInterval`-based countdown can be
  paused by the browser while a tab is backgrounded, so a user who
  stepped away with the tab minimized could return to find the countdown
  never actually reached zero. Fixed by anchoring to absolute timestamps
  and rechecking on the `visibilitychange` event, not just counting
  timer ticks.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

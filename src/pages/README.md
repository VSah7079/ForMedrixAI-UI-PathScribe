# pages/

Top-level route pages.

## Subfolder index

| Folder | What it is |
|---|---|
| [AccessionPage/](./AccessionPage/README.md) | Case accessioning form + order lookup/intraop-merge/deficiency modals |
| [BatchManagement/](./BatchManagement/README.md) | Cassette/slide chain-of-custody + the disposal/pending-load/retention-hold computed queues |
| [modals/](./modals/README.md) | Top-level page modals that don't belong to any single page's own folder |
| [ReportPreview/](./ReportPreview/README.md) | Orchestration mode's template-driven report preview renderer |
| [Synoptic/](./Synoptic/README.md) | Shared types/hooks extracted from `SynopticReportPage.tsx`, plus Codes/Comments/Delegate/UI subfolders |
| [SynopticReportPage/](./SynopticReportPage/README.md) | **Central folder** — the core clinical workflow (`/case/:caseId/synoptic`): hooks/components/modals |
| [system/](./system/README.md) | Admin config pages rendered by `Config/System/index.tsx`'s route switch |
| [WorklistPage/](./WorklistPage/README.md) | Sortable/filterable case table + its own modals |

This file also covers the loose files that sit directly in `pages/`
with no folder of their own — filled in incrementally as the
`src/pages/` review reaches each one, not written all at once.

## Files reviewed so far

- **`MockEMRPage.tsx`** — Mock/demo NHS EMR interface, embedded to
  simulate an external system integration during demos. Deliberately
  styled to look distinct from PathScribe's own dark theme (NHS blue,
  light background) — that's real, intentional, not a design-system
  violation; the distinctiveness lives in the CSS values, not in
  whether they're inline. **Fixed:** all ~30 inline styles moved to the
  new `.ps-mockemr-*` class family; 2 unnecessary `as any` casts removed
  (`caseRouter.getAll`'s opts param, the `res.data` array — both
  verified non-load-bearing via `tsc`). Real bug fix already in place
  from an earlier session, left untouched: the page used to hardcode a
  single recognized patient ID and silently show an unrelated patient
  for anything else — now does a real MRN lookup with an honest "No
  Patient Found" state.

- **`ConfigurationPage.tsx`** — Top-level tabbed Configuration shell.
  **Fixed:** all inline styles moved to the new `.ps-cfgpage-*` class
  family. `useIsAdmin()`/`useIsSuperAdmin()` were independently
  re-parsing `localStorage.getItem('pathscribe-user')` — the exact
  storage key `contexts/AuthContext.tsx` already owns and exposes via
  `useAuth()`. Rewrote both to consume `useAuth()`'s `user.role`
  instead, so there's one source of truth for the stored shape rather
  than two implementations that could drift. Also replaced a
  direct-DOM-mutation hover effect (`onMouseEnter`/`onMouseLeave`
  writing `e.currentTarget.style.color`) with a real CSS `:hover` rule
  on the new `.ps-cfgpage-tab-btn` class — the JS version bypassed
  React's rendering model for something CSS already does natively.
  **Real bug found and fixed since, per direct report**: switching a
  top-level tab, or a section within System/Integrations, never reset
  scroll position — the next tab/section could load already scrolled
  down, hiding its own add button and column headers until manually
  scrolled up. Root cause: `.ps-cfgpage-scroll` (confirmed via its own
  `overflow-y: auto`) is the real, single, shared scroll container for
  the whole page, but two of the three real state changes that can
  trigger a switch (`Config/System/index.tsx` and
  `Config/Integrations/index.tsx`'s own internal `setActive`) happen
  two component levels below it — a prop couldn't reach it without a
  larger refactor. Fixed with a small, shared, tested utility
  (`utils/resetConfigScroll.ts`) called from all real trigger paths:
  this file's own `handleTabChange`, both sub-tabs' sidebar clicks,
  both sub-tabs' URL-deep-link `useEffect`, and System's voice-navigation
  event listener. Verified live, every path independently, with a
  forced-scrollable viewport and a confirmed non-zero scroll position
  before each switch — not assumed from one working case.

- **`LoginPage.tsx`** — Public unauthenticated route. Already in good
  shape structurally: `attemptLogin`/`handleSubmit` are named functions
  (not anonymous JSX closures), correctly uses the shared `ConfirmModal`
  for the "already signed in elsewhere" session-conflict gate (not
  `window.confirm()` — this file is
  the pattern other files should follow, not an offender), no inline
  styles, no dead code. **Fixed:** `resolveEnvironment()` had an
  unnecessary double-cast on `import.meta.env.VITE_APP_ENV`
  (`(import.meta as unknown as { env?: Record<string, string> })...`).
  Traced why it existed and why it wasn't needed: Vite's own `ImportMetaEnv` base
  type is a permissive `any` fallback, so the cast was pure dead
  weight. The SSO buttons (Google/Microsoft) are intentionally
  disabled with `aria-disabled` and a "Soon" badge — not a bug, that's
  the resolved state of the "SSO buttons were fully non-functional"
  finding from an earlier session.

- **`FullReportPage.tsx`** — Standalone (outside `AppShell`) full-report
  view, reached from Worklist rows, Messages portal "view case", and
  pool-case links. The heaviest inline-style offender found so far in
  `pages/` — the entire layout, including a JS-object style-token
  pattern (`const S = {...}` typed with `React.CSSProperties`) that was
  really just inline styles centralized in JS rather than CSS.
  **Fixed:** all of it (~60 style instances) moved to the new
  `.ps-report-*` class family. 3 more direct-DOM-mutation hover hacks
  (`onMouseEnter`/`onMouseLeave` writing `e.currentTarget.style`)
  replaced with real CSS `:hover` rules — same pattern as
  `ConfigurationPage.tsx`'s tab buttons. `location.state` had two
  redundant casts: `useLocation()` always returns `Location<any>` since
  it isn't generically parameterized, so `(location.state as any)` was
  casting an already-`any` value to `any` again. Replaced with a real
  `FullReportLocationState` interface describing the two fields this
  page actually reads (`fromFilter`, `fromMessages`). Removing the old
  `S` object also left the `React` default import unused (caught by
  `tsc` after the edit — this file uses the new JSX transform, so
  `React` was only ever needed for `React.CSSProperties`). Also
  extracted one inline JSX display-string computation
  (`PoolClaimModal`'s `caseSummary` prop) to a named const.

- **`QualityAssurancePage.tsx`** — renamed from `DeficienciesPage.tsx`
  (the underlying specimen-deficiency domain terminology below is
  unchanged; the page itself now also covers Intraoperative Linkage,
  Discordance & Reconciliation, Countersign Turnaround, Access Request
  Response, and FPPE Tracking as additional tabs — this section
  documents the original deficiency-management work queue specifically).
  ISO 15189-driven nonconformance
  (deficiency) management work queue: Open → Pending Verification →
  Closed, plus Management Reviews and several other QA sub-tabs.
  Genuinely well-architected already: `ResolveModal`/`VerifyModal` are
  properly extracted named components, all handlers (`handleResolve`,
  `handleVerify`, `columnsFor`, etc.) are named functions, not inline
  JSX closures. **Fixed:** 2 inline styles in the trend-chart tooltip
  moved to new `.ps-defic-trend-tooltip-closed`/`-reopened` classes;
  2 unnecessary `as any` casts on `toLocaleDateString` options objects
  removed (verified via `tsc`); the recharts `Tooltip` content prop's
  `any` typing replaced with the library's own exported
  `TooltipContentProps` type. That last one surfaced a wider
  duplication (fixed, 5/5): the exact same
  `any`-typed tooltip pattern is repeated in 4 more files under
  `components/`, not touched here since those were already covered by
  an earlier review pass.

  **Restructured in a later session**, following a request to make this a genuine working
  queue rather than a browsable archive:
  - Fixed a real infinite-render-loop bug in `FlagManagerModal` (a
    sibling component this page links out to) that was almost
    certainly the true cause of a reported "Discard Changes silently
    loses saved work" report — see that component's own entry.
  - Added `?open=<id>` deep-link support — lands on the record's own
    tab, scrolls it into view, briefly highlights it. Built after
    tracing a dead end: Contribution Dashboard's own Quality Flags
    widget correctly showed a user's open deficiencies but linked to
    the case's synoptic page, which has no way to actually resolve one
    (only this page does) — see `ContributionDashboardPage.tsx`'s
    entry below.
  - The Open and Pending Verification tabs were merged into one,
    "Case-Specimen Deficiency" — both statuses shown together (still
    genuinely separate statuses, just not split across two tabs),
    grouped into Case-Level/Specimen-Level sections and sorted by
    accession number within each group, with a per-row colored status
    circle (reusing the existing `.ps-conf-status-dot` pattern already
    used elsewhere in Configuration, not a new one-off) distinguishing
    which is which. Closed remains its own separate tab, unchanged —
    still needed for the active Management Review batch-review
    workflow, not purely archival.
  - The *complete*, permanent historical record (all statuses, for
    compliance/inspection purposes) now lives separately, in System
    Logs' new "Quality Control" tab — see `AuditLogPage.tsx`'s entry
    below. This page stays focused on active work.

- **`AuditLogPage.tsx`** — System audit/error log viewer with role-based
  scoping (pathologists see only their own case activity; validation
  study events hidden from non-admins), CSV export, and date-range
  filtering. Heaviest file reviewed so far after `FullReportPage.tsx` —
  69 inline styles plus 4 direct-DOM-mutation hover hacks.
  **Fixed:** all of it moved to the new `.ps-auditlog-*` class family;
  `getTypeStyle`/`getSeverityStyle` converted from returning raw
  bg/color hex values to returning a class-name modifier + label, so
  the badge colors live in CSS, not JS; the last `as any` cast in the
  file (`errorResolved`'s select) narrowed to its real literal union
  type; a `stats` array computed inside an inline JSX IIFE
  (`{(() => {...})()}`) extracted to a named component-body value —
  same standard applied to embedded business logic found elsewhere in
  this review. Also consolidated a **third** independent copy of the
  `localStorage.getItem('pathscribe-user')` role-parsing duplication
  (a module-level `getRole()` plus a component-level `storedUser` IIFE,
  both bypassing `AuthContext`) onto `useAuth()` — same fix already
  applied to `ConfigurationPage.tsx`.

  **Real bug found and fixed:** the page rendered `ResourcesModal` and
  tracked `isResourcesOpen` state, but had no way to ever set it to
  `true` — no button, no listener, nothing. `WorklistPage.tsx` renders
  the same modal correctly via a global `PATHSCRIBE_PAGE_OPEN_RESOURCES`
  window event; this page was just missing that listener entirely.
  Fixed.

  **Grew a third tab in a later session:**
  "Quality Control," alongside Audit Log and Error Log, matching
  every one of their conventions exactly (tab-switcher badge, stats
  cards, status/level/date-range/search filtering, the same
  compliance-oriented CSV export with a notice/filters/requester/
  record-count header). This is now the permanent, complete Quality
  Assurance record — every deficiency regardless of status, the record
  meant to hold up under a CAP or other certification inspection —
  deliberately separate from `QualityAssurancePage.tsx`'s own working
  queue, which stays active-work-only. Defaults to All Time rather
  than the Audit tab's last-7-days default, since completeness is the
  point here. Also fixed in the same pass, not scoped to just the new
  tab: all three exports on this page (Audit, Error, now Quality) had
  hardcoded `"Requested By": "Unknown"` regardless of who was actually
  logged in — a real gap given the stated purpose of these exports.
  Fixed once at the root (`requestedByLabel`, derived from the real
  `useAuth()` user), so all three benefit, not just the new one. One
  inline style slipped into the initial build of the new tab (the
  Pending Verification status badge) — caught and moved to a proper
  class.

  **Renamed and substantially expanded in a later session still:**
  "Quality Control" → "Quality
  Assurance," and grew from covering just Deficiencies to all 8 tabbed
  item groups the working queue itself has (Intraoperative Linkage,
  Discordance & Reconciliation, Countersign Turnaround, Credentialing
  Review, Post-Finalization Drift, Patient Match Review, Management
  Reviews, alongside Deficiencies). A normalized `QualityRecord` shape
  now covers all 8, each keeping its own real status vocabulary rather
  than one fake shared set — investigated each group's actual
  underlying type before writing the mapping (`IntraoperativeEntry.
  status`, `ReconciliationRecord.outcome`, `CountersignRecord.status`,
  `FppeAssignment.status`, Post-Finalization Drift's real audit-log
  event names, etc.), not guessed. Filter row is now Group → Status
  (adapts per group) → User → Date → Search. A real service gap found
  and worked around along the way: Patient Match Review's own service
  has no cross-organisation `getAll`, only an org-scoped
  `listPendingReview` — aggregated across every organisation rather
  than silently showing just one. Management Reviews included as its
  own group despite having no real open/closed lifecycle — a completed
  review is itself the compliance evidence a review happened, per
  Pete's own reasoning when this was discussed directly.

  **Grew a real, restricted "🔗 Map Patient" trigger (originally "⚡
  Break-Glass Rebind" — see below), per direct
  confirmation, building Phase B of the "Interface Exception &
  Case-Binding Module"**: a button surfaced on the Interface Log tab
  (originally alongside the "🔌
  Interfaces" pill — see below) and gated to `isAdmin` at both the trigger and the
  modal render itself (defense in depth), opening
  `components/Audit/BreakGlassRebindModal.tsx`. A real, deliberate
  fail-safe found while wiring this in: never falls back to a guessed
  `organisationId` if the real session's own is unresolvable — a
  restricted tool silently operating on the wrong tenant's patient
  pool is a real, serious risk, so an unresolvable session simply
  doesn't render the button or the modal at all, matching this app's
  established "fail-safe rather than guess" posture elsewhere, rather
  than defaulting to a specific organisation.

  **Real, complete Interface Log redesign, later the same session,
  per direct feedback ("I feel like it deserves its own section
  because there is so much going on between PathScribe and the engine
  and instruments and 3rd party").** What was a "🔌 Interfaces" pill
  within the Error Log tab became a genuine, independent fourth
  top-level tab — its own real filter pills (Pending/Resolved/
  Dismissed, each with a real, live count), its own search state, its
  own CSV export (`exportInterfaceCSV`, matching the same meta-header/
  PHI-safety convention already established for the other three
  exports on this page — was the one real gap; Audit, Error, and
  Quality already had this). The old `?tab=errors&pill=interfaces`
  deep-link still works (real backward compatibility for
  `CrosswalkSection.tsx`'s own Unmapped Stubs banner) alongside the
  new, canonical `?tab=interfaces`. The "⚡ Break-Glass Rebind" trigger
  above was renamed "🔗 Map Patient" in this same pass — see
  `components/Audit/README.md` for the fuller account of that rename.

  **Real stats-grid removed entirely**, per direct feedback ("I would
  remove the tiles all together, recover the vertical space"): the
  four big stat cards per tab were purely visual (no `onClick`),
  duplicating the real, working filter-pill row directly beneath them
  — real, live counts now live only on the pills themselves (all four
  tabs), recovering the vertical space the cards used to take.

  **Real corner-badge positioning fix, three passes, per direct
  reports the count was covering the pill's own label text.** First
  attempt used a negative-offset, absolute-positioned badge outside
  each pill's own box (`ps-nav-badge`'s real, established pattern,
  used on the top nav's own message icon) — still overlapped a short
  label like "All," since there wasn't real room before the edge, and
  risked being clipped by any ancestor with `overflow: hidden`. Fixed,
  real approach: reserved padding *inside* each button specifically
  for the badge, with a non-negative offset, so the badge's own zone
  and the label's own zone can never overlap regardless of label
  length — applied identically to both the top-level tabs and all
  three sub-pill rows.

  **Real modal-clipping fix.** The "New Billing Code"/RVU Code Map
  modals (`components/Config/System/BillingDictionarySection.tsx`,
  `RvuCodeMapSection.tsx`) use the shared `ps-ms-overlay`, whose own
  `align-items: center` pushes a modal taller than the viewport off
  the top of the screen equally with the bottom — confirmed the real
  nav bar (`.ps-nav`) is exactly 80px tall, `position: sticky`, with
  its own `backdrop-filter` (a real, separate CSS stacking context per
  spec). A new, scoped `ps-ms-overlay--top-align` modifier (real
  clearance well past that 80px) fixes this for those two modals
  specifically — the shared class itself was deliberately left alone,
  since 28 other real modals across the app depend on it unchanged.

- **`Home.tsx`** — Landing page: navigation cards, footer, a "User
  Preferences" modal (theme picker + support links), and an About
  modal. ~40 inline styles fixed, including the per-card accent color
  — handled via CSS custom properties (`--card-accent`) set inline
  rather than raw style rules, since 8 distinct arbitrary brand colors
  isn't reducible to a small fixed set of modifier classes the way
  badge/status colors were elsewhere in this review.

  **Two real, non-cosmetic findings, both later resolved by Pete's own
  product decision, not left as documented-but-unfixed:**
  1. The entire "User Preferences" modal (theme picker, Support &
     Protocols, About PathScribe) had **no way to ever open** — traced
     to the app's move from each page owning its own `NavBar` (which
     `SynopticReportPage.tsx` still does, wiring `onProfileClick` to
     its own local modal) to the shared `AppShell` layout, which routes
     the nav avatar click to its own separate badge modal instead. This
     modal looked orphaned by that migration, not a mechanical one-line
     fix like `AuditLogPage.tsx`'s `ResourcesModal` bug was.
     **Resolved in a later session:** the whole modal, its state, and
     its wiring were deleted entirely (273 → 125 lines) — its two real,
     non-duplicate purposes (theme picker, About PathScribe's stale
     version string) were both already superseded by the working
     `AppShell` badge modal, which shows the real, live app version.
  2. Even when reachable, the theme picker only ever affects the Home
     page itself — every other page hardcodes dark-theme colors
     directly, confirmed by checking every consumer of the CSS
     variables the theme engine sets.
     **Resolved in the same later session, per Pete's explicit product
     decision:** rather than build real app-wide theming, the
     light/auto theme-switching machinery was removed entirely —
     dark-only now, a deliberate choice, not an unfinished feature.

  Also fixed in passing: `document.body.style.margin = '0'` was set
  imperatively on mount, meaning it only applied once `Home.tsx`
  happened to render — never on `LoginPage`, which loads first. Moved
  to a real `margin: 0` in `index.css`'s global `body` rule. A dead
  `(card as any).tab` ternary removed (no card object has ever had a
  `tab` field). And, found while testing the nav avatar flow:
  `AppShell.tsx`'s own badge modal had a `color-contrast` failure on
  its role text — fixed that one line, though `AppShell.tsx` as a
  whole is outside today's review.

- **`ContributionDashboardPage.tsx`** — "My Contribution" dashboard:
  Overview (KPIs, weekly chart, quality flags, teaching cases),
  Productivity, Quality, and AI Contribution tabs. The biggest file
  reviewed so far — ~90 inline styles (styled via
  `theme/pathscribeTheme.ts` tokens referenced directly in `style={{}}`
  objects; the token values were fine, applying them inline wasn't),
  all 10 `any` casts removed (verified none load-bearing), and a real
  business-logic-in-JSX IIFE (the Teaching Cases tile) extracted to a
  proper named component matching the pattern this file already used
  correctly elsewhere.

  **Real bug found and fixed:** `WarningIcon` was styled via
  `style={{ color: ... }}`, but its stroke is bound to a `color` prop,
  not CSS `color` — the style attribute silently did nothing, so the
  icon rendered its own default color instead of the intended warning
  color. Fixed by passing the real prop.

  **Two CSS duplication bugs found in `pathscribe.css`:**
  `.ps-contrib-tab-bar`/`.ps-kpi-grid` were each defined twice with
  conflicting properties silently cascade-merging (one pairing came
  with a confirmed-dead `.ps-contrib-tab-btn` class) — consolidated
  into one clean rule each, preserving the exact previous computed
  appearance. `.ps-tat-tile__*` has a much larger duplication (24
  declarations across two full parallel families) — flagged, not
  fixed, too large a tangent for this pass; worked around safely for
  this file's own needs.

  **WCAG:** fixed 3 `color-contrast` failures and 1
  `scrollable-region-focusable` gap on the Overview tab (the tab
  actually touched this session) — 0 violations after. The other three
  tabs render separate component files not reviewed this session;
  found real contrast violations there too (44 elements combined),
  flagged for when those files come up rather than fixed now.

  **`contributionDashboardCalculations.ts`** (+ `contributionDashboardCalculations.test.ts`) — real fix,
  from a direct product review: the Overview tab had seven separate
  hardcoded datasets (`mockKpis`, `mockCaseMixData`, `mockRvu30`,
  `mockClientTatData`, `mockTatTargets`, `mockTatPerf`, `mockDaily`)
  shown identically to every pathologist — including one KPI tile
  whose underlying number (128) was fake even though its label
  ("CASE_LABEL_PLACEHOLDER") was actually a working, real value. Real,
  per-pathologist calculations extracted here, replacing the hardcoded
  datasets. Reuses `resolveTatTargetHours` from
  `components/Contribution/qualityCalculations.ts` — see that file's
  own README-adjacent notes for the real TAT-target resolution logic
  this builds on.

  **Real bug found and fixed in a later session:**
  the Overview tab's own Quality Flags widget already
  correctly displayed a user's open deficiencies, case-level ones
  included — but clicking one navigated to the case's own synoptic
  report page, which has no deficiency resolve/verify UI at all (only
  `QualityAssurancePage.tsx` does). The widget's whole purpose — surface
  your own open issues so you can act on them — dead-ended on click.
  Now links to `/quality-assurance?open=<id>` instead, using deep-link
  support added to that page in the same pass (route renamed since;
  the `?open=` deep-link support itself still works unchanged — see
  `QualityAssurancePage.tsx`'s own `URLSearchParams` read). The same
  widget's other
  flag type (Frozen/Final discordances) was checked and confirmed
  already correct as-is — those genuinely do reconcile on the synoptic
  page, unlike deficiencies.

- **`IntraopQueuePage.tsx`** — Both halves of the Intraop feature: the
  mobile capture surface for starting a new frozen-section session at
  the bench, and the desktop merge queue for sessions still unlinked to
  a formal accession. One of the highest-quality files reviewed in this
  pass — already used named, well-extracted components throughout
  (`NewEntryForm`, `SkipReasonMenu`, `MilestoneActions`, `MergeModal`,
  `SpecimenCard`, `EntryCard`), no `any` casts, no direct-DOM-mutation
  hover hacks, and consistently honest inline documentation about real
  limitations (e.g. the barcode scanner is a genuine simulation, not a
  real camera read — stated plainly rather than glossed over). Only 3
  inline styles found and fixed (`.ps-intraop-discard-body`,
  `.ps-intraop-report-actions`, `.ps-intraop-desktop-switch-link`).
  Also resolved a contrast fix flagged
  from an earlier batch's broader regression check
  (`.ps-intraop-timeline-time`, `.ps-intraop-note-label`) — confirmed
  via testing that both classes were actually present in the rendered
  page (8 instances each), not just theoretically reachable.

  **Real feature, per direct confirmation: "Let's wire in Facility and
  Location (Room) for Intraop."** Two new, optional dropdowns on the
  session-start form (Submitting Facility, then a facility-scoped
  Location list), captured once per session alongside OR/surgeon. See
  `services/intraop/README.md` for the full detail.

  **Fixed in a later session, part of
  the systemic button-style cluster:** the Merge Mobile Intake Data
  modal's footer buttons used the older `.ps-ms-btn-cancel`/
  `.ps-ms-btn-apply` classes instead of the real Configuration button
  standard — every other button on this page, checked individually,
  was already correct.

- **`SearchPage.tsx`** (2,199 lines) — the largest file in the whole
  `src/pages/` review, spanning several sessions. Case search with a
  dense filter sidebar (identifier detection, demographics, status/
  priority, flags, synoptic protocols, pathologist/attending/client
  lookups, specimen/diagnosis/SNOMED/ICD code search), saved searches,
  and results integration with `WorklistTable`. ~136 inline styles —
  the most of any file reviewed — down to 7 legitimate CSS
  custom-property assignments for genuinely per-instance dynamic
  accent colors.

  **All 14 `any` casts removed, two of which were hiding a real,
  repeated bug:** `SpecimenFlag`/`CaseFlag` have a `.label` field, not
  `.name`. The computational-flags search filter and the CSV export's
  "Flags" column were both comparing against a nonexistent `.name`
  field — the computational flags filter likely never worked, and the
  export column was silently empty for every case with real flags.
  Both fixed with the real `.label` field. Also removed 2 leftover
  debug `console.log` calls.

  **A third occurrence of the `ResourcesModal`-never-opens bug** —
  fixed by adding the same
  `PATHSCRIBE_PAGE_OPEN_RESOURCES` listener pattern, verified via
  testing that the modal actually opens now. `isProfileOpen` here is
  orphaned too, same as `Home.tsx` — flagged, not guess-fixed. Tracked
  as Jira PS-65.

  **Pre-existing file corruption found and fixed:** several
  user-facing strings had double-encoded UTF-8 arrows/symbols
  rendering as garbled text on screen (the search summary's DOB
  arrow, the age range's infinity symbol, a few others) — fixed with
  clean Unicode. Decorative comment-divider characters throughout the
  file have the same cosmetic corruption but are harmless (not
  user-facing) and weren't fixed, given the low value versus the risk
  of exact-byte-matching across ~30 instances.

  **Found via testing, outside this file:** a color-contrast failure
  in the shared `components/Common/LookupModal.tsx` — fixed the one
  confirmed instance, left 4 other occurrences of the same color
  untouched since only this one was actually verified failing.

## Real, confirmed fixes — RightSynopticPanel.tsx template selection (post-review)

Two real issues found via direct report, after the review below was
already marked complete — documented here rather than reopening that
review's own scope.

**Selecting certain templates returned an empty report, no fields at
all.** Traced to `templateService.ts`'s own `getTemplate()`: a
registry entry with no matching content in `editorStore` silently
resolves to `sections: []`, regardless of what the registry's own
`fields` count claims. Reproduced directly — this was exactly the
shape of the two `'TEST'`-category registry entries ("Generic Synoptic
Test Form -- Basic"/"-- Complex"), registered for browsing purposes
per `protocolShared.tsx`'s own comment ("non-clinical test
templates"), never given real content, never meant to be selectable by
a pathologist on a real case. Fixed by filtering `category === 'TEST'`
out of the pathologist-facing picker in `RightSynopticPanel.tsx` —
scoped to that one list; admin template management elsewhere is
untouched.

**The suggested template required a click just to attach it.** Real
product decision: a pathologist shouldn't have to click the one
template already most likely correct just to get started — reducing
clicks was the entire point of the suggestion feature existing at all.
`TemplatePicker` now auto-attaches the top suggestion the moment one
exists, landing the pathologist directly on a populated report. Escape
hatch is the existing, real delete-and-re-add flow already available
on any attached report — deliberately not a second, parallel
confirmation step, since that would undo the exact click-reduction
being asked for. Guarded with a ref (not just an effect dependency) so
a later re-render can't re-trigger a second auto-attach over a report
the pathologist has already started editing or deliberately replaced.

---

## Review status

All loose top-level files in `src/pages/` have been reviewed — 39/39
on the inline-style checklist, plus
every loose top-level file covered in this README.

**Subfolder README coverage (verified August 2026):** every subfolder
now has its own `README.md`, checked programmatically — every real
file in every subfolder is actually named in that subfolder's own
`README.md`, not just assumed. `BatchManagement/`, `ReportPreview/`
(+ its `__tests__/`), `Synoptic/` (+ its four subfolders), and
`SynopticReportPage/` (+ its `modals/` and `components/`) were all
missing entirely before this pass — `SynopticReportPage/hooks/` (+ its
own `__tests__/`) already had real coverage and needed no work.

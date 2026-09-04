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
  top-level tab, or a section within System, never reset
  scroll position — the next tab/section could load already scrolled
  down, hiding its own add button and column headers until manually
  scrolled up. Root cause: `.ps-cfgpage-scroll` (confirmed via its own
  `overflow-y: auto`) is the real, single, shared scroll container for
  the whole page, but the real state change that can trigger a switch
  (`Config/System/index.tsx`'s own internal `setActive`) happens
  two component levels below it — a prop couldn't reach it without a
  larger refactor. Fixed with a small, shared, tested utility
  (`utils/resetConfigScroll.ts`) called from all real trigger paths:
  this file's own `handleTabChange`, System's own sidebar clicks,
  System's own URL-deep-link `useEffect`, and System's voice-navigation
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
  - **Real, new tab, per direct guidance ("Perhaps a new section of
    Quality Assurance maybe Patient Management")**: `patient-management`
    (`components/QualityAssurance/PatientManagementSection.tsx`),
    registered under the same `'operations'` pillar as
    `patient-match-review` — full account in that folder's own README.

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
  applied to `ConfigurationPage.tsx`. **Real, small update (PS-113,
  Stage 4):** the reconciliation log tab reads from the new, generic
  `qaActivityRecordService` now, filtered to the real Frozen vs Final
  activity type, not the old `reconciliationService`.

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
  **Real, per direct guidance ("Any existing gaps to deal with?" — no
  DLQ/retry UI for the two new real outbound patient-ADT/result
  queues, unlike billing's own `OutboundDlqSection.tsx`):** the
  `'interfaces'` tab now has its own real sub-tab structure, mirroring
  `'financial'`'s existing `financialSubTab` pattern exactly
  (`interfacesSubTab: 'exceptions' | 'outbound_dlq'`) — the pre-existing
  Interface Exceptions content moved under its own `'exceptions'`
  sub-tab, unchanged, alongside the new `'outbound_dlq'` sub-tab
  rendering `OutboundInterfaceDlqSection.tsx`. Deliberately placed
  under this tab, not `'financial'` — Patient-ADT/Result dispatch
  failures are a genuinely different real domain from billing, and
  `'interfaces'` (inbound HL7 exception review) is architecturally the
  same "operational, day-to-day monitoring queue belongs in Audit, not
  admin configuration" category `OutboundDlqSection.tsx`'s own header
  already established, just for outbound instead of inbound.

  **Real, per direct UI-review follow-up ("Fix the root" — background
  inconsistency across pages): this page's own `.ps-auditlog-bg`/
  `.ps-auditlog-bg-grad` background-image layer, and `.ps-auditlog-page`'s
  own hardcoded `background-color: #000; color: #fff;`, both removed
  entirely.** This page now falls through to `AppShell.tsx`'s own,
  real `.ps-app-root` background (see that folder's own README for
  the fuller account of the inline-style bug this whole pass traced
  back to) — matching Configuration/Quality Assurance/Intraop Queue/
  Contribution's existing, correct behavior.

- **`OutboundInterfaceDlqSection.tsx`** — new, real, per the same
  direct guidance above. Mirrors `OutboundDlqSection.tsx`'s proven
  FAILED/QUEUED table structure closely (Retry Dispatch, Simulate
  Failure, Capture as CAPA), consolidated into one screen covering
  both new queues via a type selector — same "one cohesive outbound
  interface message domain" grouping `Config/System/
  OutboundMessagePreviewSection.tsx` already established for all four
  real transaction types together. Deliberately simpler than the
  billing DLQ in one real way: no "Fix & Retry" flow for a detectable
  data gap — neither new queue has an equivalent real error category
  to billing's `MISSING_ICD10`/`MISSING_PROVIDER_NPI`; every real
  failure here is `DISPATCH_TIMEOUT`/`DISPATCH_REJECTED`, so Retry
  Dispatch alone is the complete, correct action.
  `services/hl7/simulateInterfaceDispatchFailure.ts` is a new,
  deliberately separate function from billing's own
  `simulateDispatchFailure.ts` — that one's messages specifically name
  "RCM endpoint," which would be factually wrong for a patient-identity
  or pathology-result dispatch to the interface engine. Same for the
  new `def-outbound-interface-dispatch-failure` deficiency type
  (`services/deficiencies/mockDeficiencyTypeService.ts`) — kept
  genuinely separate from billing's own `def-outbound-dispatch-failure`
  rather than reused, since that one is explicitly RCM/billing-scoped
  in its own name and description.

  **Real, per direct follow-up (gap #7 — bringing assist-mode's
  `sendSynopticReportToLis` up to the same honest queue standard):**
  extended from two queue types to three
  (`patient_adt`/`result`/`lis_sync`). Restructured around a small,
  real `QUEUE_CONFIG` object (one entry per queue type: column labels,
  identifier/kind field accessors, the three real service methods)
  rather than growing every ternary in the file into a three-way
  chain — confirmed directly this was the right call before rewriting:
  the file already had the same `queueType === 'patient_adt' ? X : Y`
  pattern repeated across 7 real places (both table headers, both
  table bodies, `retryDispatch`, `simulateFailure`, `captureAsCapa`),
  and a third branch on all seven would have made the file
  meaningfully harder to read for a gain that only grows with every
  future queue type. Config-driven means a fourth queue type later is
  one new config entry, not seven touched call sites.

  **Real, per direct follow-up ("do we implement... actual outbound
  HTTP dispatch transport" → "Dispatch needs to be generic so all
  transactions can be checked"): Retry Dispatch and a new Dispatch Now
  action now genuinely send.** Real, worthwhile bug found before real
  dispatch could even be correct: `patient_adt`'s own `transactionType`
  was a fixed `null` — the comment said "resolved per-entry below,"
  but that resolution was never actually implemented, meaning real
  dispatch for A08/A40/A47 would have silently no-op'd forever, every
  time. Fixed by turning `transactionType` into `getTransactionType(e)`,
  the same real per-entry-function pattern `getIdentifier`/`getKind`
  already use. See `services/reports/README.md`'s own account for the
  full real dispatch-transport story, including the real receiving
  end, the real dispatch function, the LIS-sync queue's own honest
  scope boundary (its full payload can't be rebuilt here, so Dispatch
  Now/Retry Dispatch are deliberately disabled for it with a clear
  reason shown), and a real `strictNullChecks: false` TypeScript
  gotcha worth remembering for future work in this codebase.

  **Real, per direct follow-up ("We are logging interface errors with
  human readable error messaging?" → "continue with the error log
  refinements"): the DLQ's own displayed error, previously coarse and
  inconsistent, is now genuinely clear and complete.** A new "Engine
  unreachable" status/Simulate button joins Dispatch timeout/rejected —
  `errorCode` is real, per-entry-resolved now (`'DISPATCH_TIMEOUT' |
  'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED'`), not hardcoded to
  `'DISPATCH_REJECTED'` at every real call site regardless of what
  actually happened, which was the real gap found while investigating
  this. See `services/reports/README.md`'s own fuller account of the
  underlying fix, which lives in `dispatchInterfaceMessage.ts` itself.

- **Real, per direct follow-up ("Continue" — the still-open "log
  reports" half of "All this must be audited and should be available
  to create log reports"): the `'audit'` tab now has a real, dedicated
  "🧬 Patient Management Only" filter**, right alongside the existing
  Type pills — independent of them (not folded into that mutually
  exclusive group), combinable with every other real filter already on
  this tab (user, date range, search), and covered automatically by
  the existing CSV export (`exportAuditCSV`'s own filter-metadata
  object gained a `'Patient Management Only'` entry, so an exported
  file honestly records whether this filter was active). Prefix-based
  (`log.event.startsWith('mpi.')`), not a hardcoded list of event
  names — a future new real `mpi.*` event type is included
  automatically, never silently missed. Covers all 8 real event types
  this app currently logs under that prefix — not just the four
  "operation" events (merged/case.moved/breakglass.rebind/match.linked)
  named in the original request, but also the ambiguous-match review
  queue's own three events and the newly-added `mpi.demographics.updated`
  below — the whole real patient-identity-management domain, not an
  arbitrarily narrowed subset.
  **Real, found-and-fixed gap surfaced while verifying this**: a
  genuinely successful `updateDemographics()` call (ADT^A08) previously
  left NO real audit trail at all — only the rejected/stale-event path
  logged anything. Fixed in `services/patients/mockPatientIndexService.ts`
  — a new `mpi.demographics.updated` event, PHI-safe by the same,
  established precedent as the stale-event log right above it: names
  only WHICH real fields changed, never the actual new values. See
  `services/patients/README.md`'s own entry for the full account and
  the new, dedicated test proving the PHI-safety (asserts the real
  changed field names appear in the audit detail, the real new values
  never do).

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

  **Real, per direct UI-review feedback on the Homepage tiles (three
  requests, all in `pathscribe.css`, not this file):** (1) `.ps-page-bg`
  — the stock background photo's own bright highlights and distinct
  geometric shapes (keyboards, monitors) were fighting the cards on
  top of it; darkened further (`brightness(0.4)` → `0.3`) and a real
  `blur(10px)` added — `inset` extended to `-40px` (was `0`) so the
  blur doesn't sample past its own edge and leave a visible,
  unblurred fringe at the page boundary; `.ps-page`'s own `overflow:
  hidden` clips the overflow safely. Confirmed `.ps-page-bg` is
  genuinely only ever used here before touching it — no other page
  affected. (2) `.ps-home-card`'s own idle-state `background` raised
  from a nearly-invisible `rgba(255,255,255,0.02)` to a real, visible
  `rgba(13,24,41,0.55)` (built from this app's own `--ps-surface` dark
  navy, not a generic white-glass default) plus a real
  `backdrop-filter: blur(14px)` — the actual glass-frosting mechanism,
  blurring whatever page background shows through the tile rather
  than just tinting over it. `.ps-home-card--hovered` gained a real
  fill-opacity increase (`rgba(13,24,41,0.72)`) to pair with the
  existing `translateY(-8px)` lift — already-existing `transition:
  all 0.3s ease` on the base class covers the new property, no
  separate transition rule needed. (3) `.ps-home-card-desc`'s
  `opacity: 0.7` (dimming whatever color showed through, compounding
  with the tile's own transparency) replaced with a real, solid
  `color: var(--ps-text-muted)` — the existing `#94A3B8`/Slate-400
  token, the exact value the request named, reused rather than a new
  hardcoded hex. Title color (`.ps-home-card-title`) left untouched —
  the request was specifically about the dimmer, secondary
  description text.

  **Real, per direct UI-review follow-up ("Can we check the new screen
  for color blindness and other visual issues?" → "Fix them all"):
  computed, not eyeballed.** Ran a real WCAG contrast computation and
  a colorblindness simulation (protanopia/deuteranopia/tritanopia,
  Brettel/Vienot-style linear-RGB matrices) against the actual color
  values in the code before changing anything. Text contrast turned
  out already excellent (7.3-15.9:1 in both a worst-case and typical
  scenario, clearing WCAG AAA) — confirmed the earlier tile-text fix
  above already worked; no further change needed there.

  Four real, distinct issues found and fixed:
  1. **Keyboard accessibility (the most serious finding, unrelated to
     color at all)** — the cards were plain `<div onClick>`: no
     `tabIndex`, no `role`, no `onKeyDown`, no `:focus` CSS rule
     anywhere. A keyboard-only user could not reach or activate a
     single tile on the page that is the primary way to navigate the
     whole app — a real WCAG 2.1.1 failure. Fixed: `role="button"`,
     `tabIndex={0}`, and a real `onKeyDown` activating on Enter/Space;
     `onFocus`/`onBlur` reuse the existing `hoveredCard` state so a
     keyboard user gets the same visible highlight a mouse user
     already did, not a second, separate visual language.
     `.ps-home-card:focus-visible` added (real `outline`, not just a
     `box-shadow`, so it stays visible regardless of the card's own
     `border-radius`/`overflow: hidden`) — `:focus-visible`
     specifically, not bare `:focus`, so it only shows for real
     keyboard navigation, not a mouse click.
  2. **A genuine, exact color duplicate — not colorblindness-specific
     at all.** Intraop Queue and My Contribution both used `#0EA5E9`,
     confirmed identical under every simulation type (distance 0.0)
     because they were already identical to normal vision.
  3. **The full 9-color accent palette replaced, fully verified.**
     Real convergence existed under protanopia/deuteranopia (the two
     common forms of red-green colorblindness, ~8% of men) —
     Configuration/Audit/Quality Assurance compressed toward the same
     yellow-green band, and Search/Intraop Queue/Batch Management
     compressed in the blue-violet range. Iterated a real
     pairwise-distance check (9 colors × 3 simulation types = 27
     checks) until every pair cleared a genuine separation threshold
     under all three simultaneously, AND every color still holds at
     least 3:1 contrast (WCAG 1.4.11) against the dark tile background
     it renders on as a hover border/glow — a color that "solved"
     colorblindness by becoming invisible would have solved nothing.
     Greens/yellows/reds mostly drawn from the real, published Wong
     (2011, *Nature Methods*) 8-color colorblind-safe palette; the
     remaining blue/violet/magenta slots verified individually since
     Wong's own set doesn't have enough entries for all 9 tiles this
     app needs. Full account and exact values in `Home.tsx`'s own
     `cards` array comment.
  4. **Two smaller, real hardening fixes.** The hover lift/fill
     transition never checked `prefers-reduced-motion` (confirmed
     directly — the only two existing rules using that media query in
     the whole CSS file are for an unrelated ticker animation,
     nowhere near Home) — a real `@media (prefers-reduced-motion:
     reduce)` block now removes the `translateY` movement specifically
     while keeping the border/background/box-shadow state-change
     feedback, so a reduced-motion user still gets clear confirmation
     a card is active. `.ps-home-card-desc` had no overflow handling
     at all on a fixed-height card that can shrink to a 260px-wide
     grid cell — added a real 2-line clamp with ellipsis (the
     longest real description, Quality Assurance's, was the concrete
     risk case) rather than letting text silently overflow.

  **New test file, `Home.test.tsx`** — none existed before this pass,
  despite this being the primary keyboard-navigation surface for the
  whole app. 5 real tests: a card is genuinely reachable via `Tab`
  (`tabIndex`/`role` both checked), Enter and Space each independently
  trigger real navigation to the card's own route, an unrelated key
  does *not* trigger navigation, and a permanent regression guard
  reading the real `--card-accent` CSS custom property off every
  rendered card confirms no two ever share a color again — cheap
  (no need to hardcode a palette copy that could drift), and reads
  from the same data the page itself renders from.

- **`ContributionDashboardPage.tsx`** — "My Contribution" dashboard:
  Overview (KPIs, weekly chart, quality flags, teaching cases),
  Productivity, Quality, and AI Contribution tabs. The biggest file
  reviewed so far — ~90 inline styles (styled via
  `theme/pathscribeTheme.ts` tokens referenced directly in `style={{}}`
  objects; the token values were fine, applying them inline wasn't),
  all 10 `any` casts removed (verified none load-bearing), and a real
  business-logic-in-JSX IIFE (the Teaching Cases tile) extracted to a
  proper named component matching the pattern this file already used
  correctly elsewhere. **Real, current status (PS-113, Stage 4):** all
  three real reconciliation-data usages (quality flags, the Teaching
  Cases tile's `teachingRecords`, the trainee case-log export) migrated
  to the new, generic `qaActivityRecordService`, filtered to the real
  Frozen vs Final activity type — including the tile's own
  `attendingFeedback` → `reviewerFeedback` rename.

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

  **Real, new (gap #6 — the proactive `moveCaseToPatient()` trigger):**
  a "🪪 Reassign Patient" action, shown once a real result row is
  selected, opening `components/Search/ReassignCasePatientPanel.tsx` —
  full account there. Reuses this page's own already-real
  `selectedResultIndex`/`runSearch()`, no new selection mechanism.

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

**Real, per direct UI-review follow-up ("Fix the root" — background
inconsistency across pages): this page's own `.ps-search-bg-image`/
`.ps-search-bg-gradient` background-image layer, and
`.ps-search-page-root`'s own hardcoded `background-color: #000; color:
#fff;`, both removed entirely.** This page now falls through to
`AppShell.tsx`'s own, real `.ps-app-root` background (see that
folder's own README for the fuller account of the inline-style bug
this whole pass traced back to) — matching Configuration/Quality
Assurance/Intraop Queue/Contribution's existing, correct behavior.

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

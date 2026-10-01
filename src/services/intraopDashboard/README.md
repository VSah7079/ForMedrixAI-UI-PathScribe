# services/intraopDashboard/

Real, per the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section
Dashboard, built against a direct, detailed design brief for
Location-First authentication with quick-switch user attribution.
Genuinely separate from `services/intraop/` (that folder's own real
scope is bench-side pre-check capture — frozen section, quick gross,
before formal LIS accession) — this folder is the real-time,
OR-facing *view* over that same, existing data, plus the new
identity/audit infrastructure a wall-mounted OR display needs that a
lab bench never did.

## Files

- **`IOrSuiteTerminalService.ts` / `mockOrSuiteTerminalService.ts`**
  — the real "Station Identity" a physical OR display "logs in as,"
  per the given design brief. Mirrors `services/scanStations/`'s own
  proven facility-scoped, Active/Inactive shape — bound to one real
  `Location` (`services/locations/`), not a Facility itself: every
  `Location` is already facility-scoped with a unique id, so a
  customer with many institutions each having their own "OR 1" was
  already structurally safe before this folder existed.
- **`resolveStaffByQuickAuthPin.ts`** — the real, working PIN half of
  "Fast User Context Switching (Badge/PIN)." Real, honest mock scope:
  a genuine RFID/NFC badge reader is real hardware integration this
  codebase cannot build; the PIN is real and fully working today,
  standing in for whichever real credential a real deployment wires
  up. Only ever resolves a real `'or-staff'`-role `StaffUser` —
  refuses outright if a matched PIN belongs to lab staff, never a
  back door into the normal, authenticated login.

## Real performance fix: per-row isolated timers (Sep 2026)

Real, per direct guidance: "there shouldn't be any business logic in
the UI at all unless it's compulsory... it's the only way I know to
prevent/control performance issues when load gets applied." Confirmed
directly: `OrSuiteDashboardPage.tsx`'s own 1-second visual-clock tick
lived as *parent-level* state — every second, it forced the entire
row list to re-render and every row to recompute its full derived
display state (`isFlashing`, `elapsedDisplay`, `rowClass`), regardless
of whether that row's own data had actually changed. At real scale
(dozens or hundreds of active rows across a Multi-Suite Overview),
that's a real, compounding cost paid every second.

- **`resolveOrBoardRowDisplayState.ts`** — the real decision logic
  (which row-state class applies, whether the flash animation should
  play, which timestamp is authoritative for the displayed elapsed
  time) extracted into a pure, tested function — no React, no timers.
- **`components/OrSuiteDashboard/OrBoardRow.tsx`** — the compulsory
  part (a clock has to tick somewhere) is now isolated to each row's
  own internal timer, wrapped in `React.memo`. A completed row's own
  interval stops entirely rather than continuing to tick a frozen
  display. The parent's own `handleFlashed` callback is wrapped in
  `useCallback` for a stable reference — without that, `React.memo`
  would still re-render every row on every parent update regardless,
  since a fresh inline callback prop defeats the memo comparison.
- Net effect at scale: N independent, cheap per-row updates instead of
  one expensive, repeated full-list recomputation every second.

Real, per a direct, detailed UI specification for the board's own
completion/dismissal flow — visual-only signaling (explicitly no
audio: "audio cues are useless in a noisy OR suite"), four real board
states (In Progress / Completed-awaiting-dismissal / Dismissal-pending
/ Dismissed), and a two-step DISMISS CASE confirmation with a
mandatory surgeon-read-back checkbox.

- **`IOrEventLogService.ts`** — gained a third `OrEventType`,
  `'case_dismissed'`, carrying the spec's full audit field list
  (accession/OR#, pathologist sign-off time, dwell time on board,
  surgeon read-back confirmation, final preliminary text, total
  turnaround) as a real, self-contained record — every field a real
  auditor needs is captured at dismissal time, not left to a later
  join against a specimen record that keeps changing.
- **`resolveActiveIntraopRequestsForLocations.ts`** — extended with
  `frozenSectionDiagnosis`, `frozenDiagnosisRenderedAt`, `orNumber`,
  `mrn`, and a real `currentWorkflowStep` derived from
  `IntraopSpecimen.milestones[]` (never an invented label unconnected
  to real data) — plus a real, additive filter: a specimen with
  `dismissedFromBoardAt` set no longer appears at all, the same real
  "presence is the state" pattern `frozenDiagnosisRenderedAt` itself
  already used.
- **`services/intraop/mockIntraoperativeService.ts`** gained
  `dismissFromBoard()` — a real safety gate, not a formality: refuses
  honestly if the read-back checkbox wasn't genuinely checked, or if
  no frozen diagnosis has actually been rendered yet.
- **Staff identification in the dismiss modal** deliberately reuses
  the existing quick-auth PIN flow above, rather than either of the
  spec's own two named alternatives (a dropdown of personnel assigned
  to the surgical case, or RFID badge-scan hardware) — neither has any
  real, existing data model or hardware integration in this app to
  build on.
- **Multi-Board Sync** ("via WebSockets or SignalR... sub-500ms latency"):
  built in Batch 342 (PS-262). See "Live updates" below.
- **Page test:** `pages/OrSuiteDashboardPage.test.tsx` covers rendering, the
  dismiss flow, demo mode and (Batch 342) live updates. An earlier note here
  said no page-level test existed; that was out of date.

## Sales demo mode (Sep 2026)

Real, per direct request: sales needs a realistic, populated board to
show customers, and a live "watch it change" moment during a
conversation — the existing `SEED_ENTRIES` (`services/intraop/
mockIntraoperativeService.ts`) are real bench-workflow test fixtures
dated months in the past, which would show as absurdly overdue on a
live board rather than a believable in-progress case.

- **`seedOrBoardDemoData(locationId, facilityId, orNumberPrefix)`**
  — real, clearly-namespaced (`demo-orboard-*` ids) fake sessions at
  four real board states (normal / warning / overdue / completed-
  awaiting-dismissal), timestamped relative to the real moment it's
  called, not hardcoded dates. Re-running it removes the previous
  demo run first, so repeated demos don't pile up stale sessions.
  Never called from any real clinical workflow — only from
  `OrSuiteDashboardPage.tsx`'s own explicit "Start demo" control.
- **`advanceDemoSpecimen(sessionId, specimenId)`** — advances one
  demo specimen exactly one real step, reusing `addMilestone`/
  `setFrozenSectionDiagnosis`'s own already-tested logic rather than a
  parallel mutation path. A real, honest no-op once a specimen already
  has a rendered diagnosis — never loops back to the start silently.
- The page wires these into a 25-second interval on its own "normal"
  seeded case once "Start demo" is clicked, so a salesperson watching
  the board sees it naturally progress through Grossing → Touch Prep
  → Sectioning → Pathologist Review → the real completion flash, while
  the other three seeded cases show every other real board state
  immediately, with no wait.
- Always visibly labeled ("Demo mode — not real patient data") while
  active — never blends in with real board content.
- **`IOrEventLogService.ts` / `mockOrEventLogService.ts`** — real,
  per "Dual-Signoff & OR Communication Bridge: time-stamped logging
  of verbal report delivery, including surgeon name, receiving
  staff, and exact timestamp." Every real event also lands in this
  app's own, already-established, cross-module audit log
  (`services/auditlog/`) — never a second, siloed record only this
  dashboard can see.
- **`resolveIntraopTatStatus.ts`** — the real, pure, live-timer logic
  per "Stat Alert Escalation... standard 20-minute turnaround."
  Mirrors `services/batches/DecalBatch.ts`'s own real, proven
  `getDecalTimerState()` exactly: elapsed time computed client-side
  against an absolute timestamp, never a server-pushed tick — a
  dropped connection never freezes or staleness-poisons a STAT clock,
  since the client keeps computing correctly through any gap. Both
  the target and warning window are real, admin-overridable
  parameters, not hardcoded — the RFP's own "e.g." wording confirms
  20 minutes is an example, not a universal constant.
- **`resolveActiveIntraopRequestsForLocations.ts`** — the real query
  behind "active operating room (OR) requests, tissue arrival status,
  pathologist assignment." A pure filter/shape function over this
  app's own, existing `IntraoperativeEntry`/`IntraopSpecimen` data —
  not a second, parallel intraop entity. Excludes any session already
  merged into a real Case (it's moved past this dashboard's own
  reason to exist) and any session at a `locationId` outside the
  requested set — direct, tested protection against cross-suite/
  cross-facility leakage in the "Multi-Suite Overview."

## The dashboard itself

`pages/OrSuiteDashboardPage.tsx` — deliberately mounted as a genuinely
**public**, unauthenticated route (`/or-suite-dashboard`), per the
given design brief's own core design: this is a wall-mounted terminal
that must never hit this app's normal session timeout, not a lab-
staff login. **Real, direct correction caught before shipping**: this
page was initially wired inside the app's normal `<ProtectedRoute />`
wrapper (matching the existing `/intraop-queue` route it sits next to)
— which would have defeated the entire point of a kiosk display.
Moved to a public route once caught. Individual attribution for a
real action happens via the page's own, separate quick-auth PIN flow,
never via the app's own login.

`hooks/useCurrentOrTerminal.ts` — the sticky, `localStorage`-backed
terminal binding ("Store the location_id... so if the browser reloads
or the terminal restarts, it immediately reconnects... without
requiring user re-authentication"). Mirrors `useCurrentScanStation.ts`'s
own real, proven same-tab-sync fix (a module-level subscriber set,
since the native `storage` event only ever fires for other tabs).

`components/Config/System/OrSuiteTerminalsSection.tsx` — real admin
CRUD for `OrSuiteTerminal`, with the same real facility→location
cascade `ScanStationsSection.tsx` already established.

## Live updates (Batch 342, PS-262)

The board subscribes to its OR locations through
`hooks/useLiveIntraopUpdates.ts` (`services/liveUpdates/`).
- **With the hub:** the API server's SignalR hub delivers a dismissal, new
  request or diagnosis from any device to every board showing that location
  (target under 500 ms).
- **Without it:** this browser's other windows update instantly and other
  devices are picked up by 15-second polling.
- **Badge:** the header shows the connection state.

**Moved out of the page in the same change:**
- `resolveOrBoardLiveView.ts`: which locations the board shows
  (Multi-Suite rules) and when the "3-pulse flash" plays;
- `dismissFromBoardWithAudit.ts`: the dismissal, then its event-log/audit
  record. A failed log write is now reported rather than ignored.

**Also fixed:**
- the page imports the terminal and event-log services from `@/services`
  (off the mock-import baseline);
- two hard-coded separators became translated templates, and a refused
  dismissal shows the translated message instead of the service's English
  text;
- the demo timer no longer calls a stale copy of the refresh.

Tests: `orBoardLive.test.ts`.

**Not addressed here, and worth naming plainly**: the RFP's own fourth
sub-requirement for this gap, "Correlation Engine: Automatic
correlation flagging between frozen section diagnosis and final
permanent section histology, with automated discrepancy logging" —
confirmed directly, this app's own existing Frozen-vs-Final
correlation (`services/quality/`, `FROZEN_FINAL_ACTIVITY_TYPE_ID`) is
real and structurally sound, but the actual trigger is genuinely
manual: a pathologist opens `DiscordanceReconciliationModal.tsx`
themselves during sign-out. Nothing here automates that trigger — a
real, separate, later piece of work.

## A real, pre-existing gap found and fixed along the way

Two, genuinely different `StaffUser` type definitions already existed
in this codebase before this work — a stale one in `types/index.ts`
and the real, active one in `services/users/IUserService.ts` — and a
**third**, locally-redeclared copy inside
`components/Config/Staff/StaffTab.tsx` itself, structurally near-
identical to the real one but not imported from it. The new
`quickAuthPin` field had to be added to both of the two real ones by
hand; TypeScript only caught the second because the two shapes
happened to diverge on this one new field — a silent drift on any
field that stays structurally compatible would go uncaught. Not
restructured here (a real, separate consolidation), but worth
knowing about independent of this specific change.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

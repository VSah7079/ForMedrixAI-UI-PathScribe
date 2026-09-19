# PathScribe Update 259 — PS-288: Enterprise Laboratory Operations Dashboard Engine

Fifth and final of the confirmed PS-284 → 285 → 286 → 287 → 288
workstation-build sequence. Per direct scope confirmation (two-question
`AskUserQuestion`, both answered in full): all five department
dashboard views, the facility-scoping investigation (found already
fixed in a prior pass — see below), the Display Profile / device
registry (data-only), high-contrast alerting & SLA countdown styling,
and an honest polling stand-in for real-time push (plus a real
Offline/Stale Data badge) rather than true WebSocket/SSE.

## What was built

### Types & data model
- `services/facilityOpsDashboard/IDisplayProfileService.ts` — the
  Display Profile / device registry: `DisplayProfile` (name,
  performing-lab `facilityId`, one-or-more `assignedViews`, an
  optional `carouselIntervalSeconds`, an honestly informational
  `deviceToken`), same real "Station Identity" shape as
  `OrSuiteTerminal`.
- `services/facilityOpsDashboard/IFacilityOpsDashboardTypes.ts` — the
  one, shared `DashboardSummary` shape (stat tiles / queue rows /
  alerts) every one of the five real department summary functions
  returns.

### Pure business logic (+ tests)
- `computeSlaCountdown.ts` — real, direct generalization of
  `DecalBatch.ts`'s own `getDecalTimerState` math, shared across every
  dashboard view rather than reinvented per view.
- `resolveBatchFacilityId.ts` — the real, confirmed join for scoping a
  `Batch` to a facility (it has no direct `facilityId`):
  `BatchItem.caseAccession` → `Case.originHospitalId`, falling back to
  `Batch.stationId` → `ScanStation.facilityId`.
- `buildFacilityLookupMaps.ts` — the shared case/station lookup maps
  every summary function needs.
- Five real `compute*Summary` functions — one per department view
  (Grossing & Intake, Embedding & Microtomy, Staining & IHC, Send-Out
  & Reference Laboratory, Diagnostic Sign-Out/Scanner) — each pure
  aggregation over this app's own existing real data (`Batch`,
  `HistologyBlock`/`StainOrder`, `ReferralTracking`, `WsiScanBatch`),
  never a new, parallel data model.
- `mockDisplayProfileService.ts` — same real CRUD/seed/storage pattern
  as `mockOrSuiteTerminalService.ts`.

### UI
- `pages/FacilityOpsDashboard/` — `FacilityOpsDashboardPage.tsx` (the
  kiosk entry point: bind-a-profile setup screen, real carousel timer
  between assigned views, 20s polling, live clock, and a real
  Offline/Stale Data badge), `viewRegistry.ts`, and
  `components/DashboardSummaryView.tsx` (the one, shared
  presentational component all five views render through).
- `hooks/useCurrentDisplayProfile.ts` — same real, proven
  localStorage-persisted, same-tab-sync binding pattern as
  `useCurrentOrTerminal.ts`.
- `components/Config/System/DisplayProfilesSection.tsx` — the admin
  registry (add/edit/deactivate), wired into `Config/System/index.tsx`
  and `configSearchIndex.ts`. Built with `useTranslation()`/`t()` from
  the start, per this session's own standing multi-language
  instruction.
- `pathscribe.css` — new `.ps-opsdash-*` class family, generalizing
  `.ps-orboard-*`'s own high-contrast, dark, wall-display conventions
  (STAT-red borders, flashing overdue tiles, SLA-colored countdown
  clocks).
- `App.tsx` — new route `/facility-ops-dashboard`, deliberately
  public/unauthenticated (same real "Station Identity, not a per-user
  login" reasoning as `/or-suite-dashboard`).
- `Home.tsx` — new nav tile. **Deliberate deviation** from the
  OR-board precedent (which has no Home tile at all): added here for
  real discoverability, since the user should be able to find these
  five dashboards from Home, not just a kiosk URL an admin already has
  to know. Still the same real, public route underneath.

## Investigation done before building (confirmed, not assumed)

- **The Epic's own flagged "`computePendingBatchQueue.ts` is not
  facility-scoped" claim was checked directly and found stale** — that
  gap was already closed in a prior pass (the file's own header now
  reads "corrected per PS-289's own direct request"). No code change
  was needed here; this update reuses that function directly for the
  Grossing & Intake view's pending-count.
- `Batch` has no direct `facilityId` — confirmed by reading
  `IBatchService.ts` in full. `resolveBatchFacilityId.ts`'s own
  two-step join (case-accession first, station fallback) was built and
  tested against this real gap, not assumed.
- `WsiScanBatch` also has no direct `facilityId` — only each real
  slide carries a `caseId` — confirmed the same way, before building
  `computeDiagnosticSignOutSummary.ts`'s own per-slide join.
- `getDecalTimerState`/`formatDecalDuration` (`DecalBatch.ts`) are
  genuinely generic despite their file's name — confirmed by reading
  the function bodies, then generalized (not duplicated) into
  `computeSlaCountdown.ts`.
- `StainOrder.stainName` is confirmed (via `types/case/Specimen.ts`'s
  own disclosure) to be a real display-name string, **not yet** a real
  FK into the Stain Dictionary — the Staining & IHC dashboard reports
  by the real, clean `StainOrderStatus` field instead of building an
  unreliable name-matching category heuristic on top of a known gap.
  Documented as a deliberate scope cut, not a fixed one.
- `services/intraopDashboard/`'s own `OrSuiteTerminal`/
  `OrSuiteDashboardPage.tsx` (the RFP-APLIS-2026-GLOBAL Intraoperative
  Dashboard) turned out to be a real, directly-precedented "wall
  display bound to a device profile, public/unauthenticated route,
  honest-polling-with-a-disclosed-gap" architecture — reused as the
  template for the Display Profile registry, the binding hook, and the
  route's own public posture, rather than designed from scratch.

## i18n

Built with `useTranslation()`/`t()` from the start (new page + new
admin section). New `facilityOpsDashboard.*` and `displayProfiles.*`
namespaces, plus `home.facilityOpsDashboardTile.*`, across all five
locale files (en/fr/de/nl/ko). Verified programmatically:

- All five locale files parse as valid JSON.
- All five have **identical key sets**: 849 leaf keys total per file
  (up from 810 after PS-287), 39 of them new, matched exactly across
  every locale.

## READMEs updated in the same pass

- `services/facilityOpsDashboard/README.md` (new)
- `pages/FacilityOpsDashboard/README.md` (new)
- `pages/README.md` (new subfolder-index row)
- `services/README.md` (new top-level folder-index row)
- `i18n/README.md` (new "Eighth real conversion" entry)
- `components/Config/System/README.md` (file-count line updated)
- `services/batches/README.md`, `services/scanStations/README.md`,
  `services/referral/README.md`, `services/digitalPathology/README.md`,
  `services/cases/README.md` (new real-consumer notes)

## Validation

- **`npx tsc --noEmit -p .`**: completely clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **471/471
  test files, 4128/4128 tests passing, zero failures** (same harmless
  `ECONNREFUSED 127.0.0.1:3000` stderr noise as every prior run this
  session, unrelated to test pass/fail).
- New tests: `computeSlaCountdown.test.ts` (9), `resolveBatchFacilityId.test.ts`
  (6), `facilityOpsDashboardSummaries.test.ts` (5) — **20/20 passed.**

### Real regression caught and fixed by this pass's own tests

- `computeSlaCountdown`'s own truthy check on `targetDurationMinutes`
  (`if (... && b.targetDurationMinutes)`) silently treated a real,
  legitimate `0`-minute target as "no target set," skipping the SLA
  countdown entirely. Caught by `computeGrossingIntakeSummary`'s own
  test, fixed with an explicit `!= null` check.
- `DemoResetTab.coverage.test.ts` (an existing, automated audit from
  an earlier pass) caught both of this update's own new storage keys
  (`displayProfiles`, `pathscribe_current_display_profile_id`)
  unregistered on first run — fixed by adding both to `DemoResetTab.tsx`,
  mirroring `orSuiteTerminals`/`pathscribe_current_or_terminal_id`'s
  own real precedent exactly.

## Deliberate scope cuts

- **No true WebSocket/SSE real-time push** — this app has no backend
  infrastructure for that. Honest 20s polling instead, **plus** a real
  Offline/Stale Data badge on failed/stale fetch — the one real gap
  `OrSuiteDashboardPage.tsx` itself still has.
- **No fabricated SLA/target-duration numbers** anywhere a real source
  doesn't exist (Embedding, Microtomy, Staining, Send-Out batches all
  show honest elapsed age, uncolored, rather than an invented target).
- **No Routine/Special-Stain/IHC/Molecular category breakdown** on the
  Staining & IHC view — see Investigation above.
- **`deviceToken` is informational only** — no physical kiosk hardware
  is reachable from this environment to bind against for real.
- **No physical device binding verification** — the Display Profile
  registry is explicitly data-only, per direct scope confirmation.

## Next

This closes the confirmed PS-284→285→286→287→288 workstation-build
sequence. Physical foot-pedal integration remains the next, distinct
item per the user's own earlier direct instruction ("After 288, we
will need to address foot-pedal integration support... These foot
pedals are ubiquitous and we must support them.").

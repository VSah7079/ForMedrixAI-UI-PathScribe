# pages/FacilityOpsDashboard/

Real, per PS-288 (Enterprise Laboratory Operations Dashboard Engine),
fifth and final of the PS-284→285→286→287→288 workstation-build
sequence. Five real, high-contrast, wall-display department dashboard
views (Grossing & Intake, Embedding & Microtomy, Staining & IHC,
Send-Out & Reference Laboratory, Diagnostic Sign-Out/Scanner) behind
one real route (`/facility-ops-dashboard`), bound via a real
[Display Profile](../../services/facilityOpsDashboard/README.md).

## Deliberate design choice: public, unauthenticated route

Same real reasoning as `pages/OrSuiteDashboardPage.tsx`/`App.tsx`'s own
routing comment: a Grossing/Staining/etc. bench wall display isn't a
per-user login — it binds once (`useCurrentDisplayProfile.ts`, same
real localStorage-persisted pattern as `useCurrentOrTerminal.ts`) and
must keep running without ever hitting this app's own normal session
timeout. `/facility-ops-dashboard` sits outside `ProtectedRoute`/
`AppShell` in `App.tsx`, exactly like `/or-suite-dashboard`.

**Deliberate deviation** from that same precedent: unlike
`OrSuiteDashboardPage`, this one *does* get a `Home.tsx` nav tile. The
five department dashboards are a real, direct deliverable the user
should be able to find from Home, not just a kiosk URL an admin
already has to know — the tile is simply a convenience entry point
into the same real, public route.

## Files

- **`FacilityOpsDashboardPage.tsx`** — the entry point. Unbound →
  `ProfileSetup` (pick a Display Profile, mirrors
  `OrSuiteDashboardPage.tsx`'s own `TerminalSetup`). Bound → resolves
  the profile's own `assignedViews`/`facilityId`, carousels between
  views on a real timer when more than one is assigned
  (`carouselIntervalSeconds`, default 20s), and polls the current
  view's own `compute*Summary` function every 20s. Real "Offline /
  Stale Data" badge (`ps-opsdash-offline-badge`) whenever the last
  poll failed or is more than two poll intervals old — the one real
  gap `OrSuiteDashboardPage.tsx` itself still has; never a claim of
  true real-time push (see `services/facilityOpsDashboard/README.md`).
  **Real, closed gap (direct follow-up):** `ProfileSetup` now
  consults the selected profile's own `deviceToken` — a profile with
  one recorded requires it typed correctly before the bind completes
  (`confirmTokenTitle` step); a profile with none set still binds
  straight from the dropdown. Still not real hardware verification —
  see `services/facilityOpsDashboard/README.md`'s own full account of
  what this does and doesn't close. Covered by the new
  `FacilityOpsDashboardPage.test.tsx` — no render test existed for
  this page's binding step before.
- **`viewRegistry.ts`** — the one real place mapping each
  `DashboardViewId` to its own `compute*Summary` function and i18n
  title key.
- **`components/DashboardSummaryView.tsx`** — the one, shared
  presentational component every one of the five views renders
  through (stat tiles + alerts + queue rows), since every
  `compute*Summary` function returns the exact same real
  `DashboardSummary` shape.
- The real binding hook (`useCurrentDisplayProfile.ts`) lives in the
  app-wide `src/hooks/` folder, same placement as
  `useCurrentOrTerminal.ts`, since it's a general-purpose "what's this
  browser bound to" concern, not page-private state.

## i18n

Built with `useTranslation()`/`t()` from the start. `facilityOpsDashboard.*`
namespace (this page) plus `displayProfiles.*` (the admin registry,
`components/Config/System/DisplayProfilesSection.tsx`) and
`home.facilityOpsDashboardTile.*`, across all five locale files
(en/fr/de/nl/ko) — verified programmatically: identical key sets,
849 total leaf keys per file (up from 810 after PS-287).

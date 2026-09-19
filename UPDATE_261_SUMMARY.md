# PathScribe Update 261 — PS-289: Close the "Go to Bench" Deep-Link Gap

Direct follow-up on "Proceed with 289." Before writing any code, checked
what PS-289 actually was — its own 15-comment Jira thread shows the
`WorkstationGroup`/`ActionGroup`/discipline-registry foundation, the
TAT-critical default-action-on-scan mechanics, and the full Stain QC
Gating Strategy tie-in (PS-292) were **already built** in a prior pass on
this codebase, not something to build fresh. Verified directly against
the running code (not the ticket's own account) — `services/
workstationGroups/`, `services/actionGroups/`, `WorkstationGroupsSection.tsx`,
`ActionGroupsSection.tsx`, `checkStainQcGate.ts`, `StainQcGateModal.tsx`
all genuinely exist, wired, and tested.

## The one real gap found

PS-289's own addendum comment named a specific piece and it was never
actually delivered: `WorkstationGroup.dedicatedPageRoute` was captured by
the admin CRUD screen (`WorkstationGroupsSection.tsx`'s own input field)
and stored on the record — but nothing anywhere ever read it back to
actually deep-link a technician to their bench. Confirmed by grep: the
field appeared in exactly two places, both just setting it, never
consuming it.

The addendum's own reason for leaving this unbuilt no longer holds:
"none of the three [bench pages] has been built yet, so no real
functional area has anywhere to link to today." All three now exist —
this session's own PS-284→288 sequence shipped `/workstations/microtomy`,
`/workstations/embedding`, and `/workstations/slide-distribution` — so
this deep-link now has real destinations, not speculative ones.

## What was built

- **`components/NavBar/NavBarScanStation.tsx`** — the always-visible
  station control already resolves the effective station's own
  `WorkstationGroup` on every change (that's how `functionalArea`/
  default action groups already reach the Action Registry). The same
  effect now also captures that group's `dedicatedPageRoute` and, when
  one is set **and** the group is Active, renders a real, one-click
  "🔬 Go to Bench" button beside the station pin — `useNavigate()` to
  the real route, matching this file's own existing `useNavigate`
  precedent in `NavBar.tsx`. No route set (the honest default — groups
  seed empty, per `mockWorkstationGroupService.ts`'s own comment) means
  no button; never a disabled placeholder standing in for "not
  configured yet."
- **`pathscribe.css`** — new `.ps-navbar-bench-btn` class, deliberately
  a distinct green rather than the station pin's cyan (an action, not
  an identity indicator); `.ps-navbar-station-wrap` given `display:flex`
  so the two buttons sit cleanly side by side.

## Deliberate scope cuts

- **No seed data added to `mockWorkstationGroupService.ts`** — it's
  deliberately empty by PS-289's own design ("no automatic migration...
  an admin assigns membership deliberately, going forward"); an admin
  still has to create a group and set its route through the existing
  CRUD screen before this button ever appears. That's the honest,
  already-decided posture, not something this pass should override.
- **No change to the admin list/detail view itself** — the addendum
  named "a workstation group's own list/detail view" as one option;
  the always-visible NavBar control was chosen instead as the real,
  zero-extra-step consumption point, matching the same design
  philosophy the default-action-on-scan piece already established
  (station selection alone is the trigger, no separate screen to visit).
- **No new tests** — `NavBarScanStation.tsx` has never had a dedicated
  test file (unlike the safety-critical `useGlobalStationSwitch.ts`,
  which does); this is UI glue over already-tested service calls
  (`mockWorkstationGroupService.getById`), validated via `tsc` and the
  full regression run instead, matching this file's own established
  convention.

## Validation

- **`npx tsc --noEmit -p .`**: completely clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **471/471
  test files, 4128/4128 tests passing, zero failures**, unchanged counts
  from before this change — confirms nothing regressed and no test file
  was silently skipped.

## Next

With this, every item PS-289's own comment thread flagged as "genuinely
not built yet" is now closed except the two it explicitly deferred on
purpose (`qcEnforcementMode`'s per-stain override — blocked on the
`StainOrder.stainName` FK gap documented elsewhere — and Autopsy's own
functional-area set, deferred to PS-261 by name). No further PS-289 work
is currently queued.

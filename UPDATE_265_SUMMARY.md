# PathScribe Update 265 — Homepage Changes part 1

Direct request, verbatim: *"Create Pathology Workspace Tile on Home page
and move the following into that: Cytology Workspace, Microtomy
Workstation - also rename Microtomy Workspace, Embedding Station - also
rename Embedding Workspace, Slide Distribution Station - rename Slide
Distribution Workspace, Move Facilities Ops Dashboards under
Configuration."*

## What changed

### 1. New "Pathology Workspace" tile on Home, replacing four flat tiles

Home's card grid used to have five separate top-level tiles: Cytology
Workspace, Microtomy Workstation, Embedding Station, Slide Distribution
Station, and Facility Ops Dashboards. Now there is one **Pathology
Workspace** tile (same teal `#009E73` the old Cytology Workspace tile
carried — freed up when that tile moved, still distinct from every tile
remaining on Home) that opens a brand-new hub page.

### 2. New page: Pathology Workspace (`/pathology-workspace`)

`src/pages/PathologyWorkspacePage/PathologyWorkspacePage.tsx` — a small,
second-level grid of the four tiles that used to sit on Home directly,
reusing Home's own `.ps-home-cards-grid`/`.ps-home-card` visual language
(same background-image treatment, same keyboard accessibility) rather
than a new card style:

| Old Home tile | New tile here | Renamed? |
|---|---|---|
| Cytology Workspace | Cytology Workspace | No — moved only |
| Microtomy Workstation | **Microtomy Workspace** | Yes |
| Embedding Station | **Embedding Workspace** | Yes |
| Slide Distribution Station | **Slide Distribution Workspace** | Yes |

Each tile still routes to exactly the same page it always did
(`/cytology-worklist`, `/workstations/microtomy`,
`/workstations/embedding`, `/workstations/slide-distribution`) — only the
tile's own label changed for the three renamed ones, and only its
location moved for Cytology. The individual workstation pages' own
on-screen titles (e.g. "Microtomy Workstation" as the page header inside
`MicrotomyWorkstationPage.tsx`) are untouched — those come from a
separate i18n key (`microtomyWorkstation.pageTitle`) that was never part
of this request.

The page wires into the app's existing breadcrumb system
(`useBreadcrumb()`), so visiting it shows "Home › Pathology Workspace" in
the breadcrumb bar with a working link back — confirmed live.

### 3. Facility Ops Dashboards moved under Configuration

The Facility Ops Dashboards tile is gone from Home. Its entry point now
lives in **Configuration → System → Lab Materials & Workflows → Display
Profiles (Facility Ops Dashboards)** — a new "🖥️ Open Facility Ops
Dashboard" button next to "+ Add Display Profile", right where an admin
is already managing the wall-display profiles that dashboard reads from.
Clicking it navigates to the exact same
`/facility-ops-dashboard` route the old Home tile used — that route
itself, and its deliberately public/unauthenticated kiosk behavior, are
completely unchanged; only its discovery path moved, per the direct
instruction.

### 4. i18n — full 5-locale parity (EN/FR/DE/NL/KO)

New `pathologyWorkspace` namespace (page title/subtitle, back-to-home
link, and the four tile title/description pairs) added to all five
locale files, translated, not just English. `home.pathologyWorkspaceTile`
added for the new Home tile. The four now-unused old keys
(`home.microtomyTile`, `home.embeddingTile`, `home.slideDistributionTile`,
`home.facilityOpsDashboardTile`) were removed rather than left orphaned.
One new key, `displayProfiles.launchDashboardButton`, was added for the
Configuration launch button.

**Verified programmatically**: all five locale files parse as valid JSON
and have exactly the same 860 leaf keys, in every locale — full parity,
no drift.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **476/476 test
  files, 4154/4154 tests passing, zero failures** — including
  `Home.test.tsx`'s own keyboard-accessibility and no-duplicate-color
  regression tests, both still green against the changed tile set.
- **Live browser verification (Playwright, this pass)**: logged in with
  the app's own demo credentials and confirmed, against the real running
  app, not just source:
  - Home's card grid no longer shows Cytology Workspace, Microtomy,
    Embedding, Slide Distribution, or Facility Ops Dashboards, and does
    show the new Pathology Workspace tile.
  - Clicking it opens `/pathology-workspace`, showing exactly the four
    expected tiles with the correct renamed titles, and the breadcrumb
    reads "Home › Pathology Workspace".
  - Clicking "Microtomy Workspace" there navigates to
    `/workstations/microtomy`, same as before.
  - Configuration → System → Display Profiles shows the new "Open
    Facility Ops Dashboard" button, and clicking it navigates to
    `/facility-ops-dashboard`, same as the old Home tile did.

## Follow-up, same session: Molecular folded in as a 5th sub-tile

Direct follow-up: rename the standalone "Molecular" Home tile to
"Molecular Workspace" and move it under Pathology Workspace too; also
rename the page itself from "Molecular Workcenter" to "Molecular
Workspace."

- Home's separate "Molecular" tile is gone — folded into Pathology
  Workspace as a 5th sub-tile, "Molecular Workspace" (same `/molecular`
  route, same `#7C3AED` color).
- `MolecularWorkcenterPage.tsx`'s own on-screen `<h1>` now reads
  "Molecular Workspace" (was "Molecular Workcenter") — no other file
  referenced the old string, confirmed by search, so this was a safe,
  contained rename.
- Grouped here by **domain** ("pathology"), not by shared audience —
  Molecular Workspace's own molecular-tech bench workflow is genuinely
  distinct from the other four tiles' histology-bench/cytology-screening
  audiences, matching the reasoning already given for why Cytology and
  Microtomy sit together despite not sharing an audience either.
- **Molecular Order Queue** (`/molecular-order-queue`) deliberately
  stayed on Home, untouched — only "Molecular" itself was named for this
  move. (Separately under discussion: whether Order Queue, which is
  explicitly scoped as a demo/simulation tool rather than a production
  workflow, belongs in Configuration instead — not yet decided/built.)
- `pathologyWorkspace.pageSubtitle` and `home.pathologyWorkspaceTile.
  description` updated in all 5 locales to mention molecular diagnostics
  alongside cytology/microtomy/embedding/slide distribution.
- New `pathologyWorkspace.molecularTile` (title + description) added and
  translated in all 5 locales. **Re-verified**: all five locale files
  still parse as valid JSON with identical leaf-key counts (862 each).
- Re-validated: `tsc --noEmit` clean; full suite 476/476 files, 4154/4154
  tests still passing; confirmed live in a real browser — Home no longer
  shows "Molecular," Pathology Workspace shows all 5 sub-tiles including
  "Molecular Workspace," and clicking it opens `/molecular` with the
  page's own heading correctly reading "Molecular Workspace."

## Files changed

- `src/pages/Home.tsx` — removed 5 flat tiles (Cytology Workspace,
  Microtomy, Embedding, Slide Distribution, Facility Ops Dashboards) plus
  the separate "Molecular" tile, added 1 "Pathology Workspace" tile.
- `src/pages/PathologyWorkspacePage/PathologyWorkspacePage.tsx` — new hub
  page, 5 sub-tiles (Cytology, Microtomy, Embedding, Slide Distribution,
  Molecular Workspace).
- `src/pages/MolecularWorkcenterPage/MolecularWorkcenterPage.tsx` — page
  heading renamed "Molecular Workcenter" → "Molecular Workspace."
- `src/App.tsx` — new lazy route for `/pathology-workspace`.
- `src/components/Config/System/DisplayProfilesSection.tsx` — new
  "Open Facility Ops Dashboard" launch button.
- `src/i18n/locales/{en,fr,de,nl,ko}.json` — `pathologyWorkspace`
  namespace added (including `molecularTile`), `home.pathologyWorkspaceTile`
  added, `displayProfiles.launchDashboardButton` added, 4 unused old
  `home.*` tile keys removed. Full 5-locale parity confirmed (862 leaves
  each).

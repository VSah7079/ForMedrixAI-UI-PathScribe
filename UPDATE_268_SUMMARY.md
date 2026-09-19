# PathScribe Update 268 — Quality & Compliance hub (Audit + Quality Assurance grouped)

Direct follow-up to *"are there any [Home tiles] that can be grouped, trying
to reduce the cognitive load"* — one clear, defensible grouping found and
built; two other candidates considered and deliberately left alone.

## What changed

Home's flat **Audit** and **Quality Assurance** tiles are now one tile,
**Quality & Compliance**, leading to a new second-level hub
(`QualityComplianceHubPage.tsx`) with those same two pages one click
deeper — the same real hub pattern already established for Pathology
Workspace.

**Why these two, specifically:** both are the same domain and audience —
a quality manager or compliance officer, not a pathologist's or tech's
daily-frequency tool. Audit (`AuditLogPage.tsx`) is System Logs — Audit
Log, Error Log, Interface Log, Financial — and already has its own real
"Quality Assurance" tab, documented in that file as the permanent
historical archive. Quality Assurance (`QualityAssurancePage.tsx`) is
that archive's live counterpart — the active CAPA working queue.
Complementary halves of one compliance record, not one containing the
other, and low daily-frequency for most users — exactly the profile
worth trading one click for less Home-page clutter.

**Two other candidates were considered and deliberately NOT grouped
here** — flagging this directly rather than silently deciding either
way:
- **Cytology QC Peer Review Queue** — its own header comment describes a
  real, near-daily pathologist queue explicitly meant to eventually live
  inside the main Worklist itself. Burying it under a Compliance hub
  would slow down its real, frequent users — the opposite of the point
  of this change.
- **Batch Management** — its own processing-node scope (External
  Referral, Decal/Special Processing, etc.) is genuinely broader than
  the five pathology-bench domains already grouped in Pathology
  Workspace, so it doesn't cleanly belong in either hub.

**One more real fix along the way:** the old flat Audit tile's own
description ("...Audit Trail, and Quality Assurance") was the actual
source of the ambiguity raised in the prior question — it read as if
Audit contains Quality Assurance. Sitting the two tiles side by side in
the new hub, unchanged, would have reproduced that same confusion one
level deeper. Their descriptions inside the hub are reworded instead:
Audit's now reads "System activity logs, error and interface exception
logs, and financial audit trail" — no mention of Quality Assurance,
since that's now its own clearly separate sibling tile right next to it.

## Files changed

- **`src/pages/Home.tsx`** — the flat "Audit" and "Quality Assurance"
  tiles removed; one new "Quality & Compliance" tile added (`#D55E00` —
  the real color the old Audit tile carried, reused rather than
  orphaned, same precedent as Pathology Workspace reusing Cytology's old
  color).
- **`src/pages/QualityComplianceHubPage/QualityComplianceHubPage.tsx`**
  (new) — the hub page itself, same `.ps-home-cards-grid`/`.ps-home-card`
  visual language, breadcrumb (`pushCrumb`), and keyboard-accessible card
  pattern as `PathologyWorkspacePage.tsx`.
- **`src/App.tsx`** — lazy import + `/quality-compliance` route.
- **`src/i18n/locales/{en,fr,de,nl,ko}.json`** — new
  `home.qualityComplianceTile` and `qualityComplianceHub` namespace, all
  5 locales hand-translated (not machine placeholders). Leaf-key count
  verified identical across all 5 locales: **871 leaves each** (up from
  862, +9 new keys).

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run src/pages/Home.test.tsx`**: 5/5 passing, including
  the real color-distinctness regression guard (reads live
  `--card-accent` values — confirms the new tile's reused `#D55E00`
  still doesn't collide with anything else on Home).
- **`npx vitest run --exclude firestore.rules.test.ts`** (full suite):
  476/476 test files, 4154/4154 tests passing — same steady count as
  every prior validation run this session.
- **Live browser verification (Playwright)**:
  - Home no longer shows flat "Audit" or "Quality Assurance" tiles; the
    new "Quality & Compliance" tile is present.
  - Clicking it lands on `/quality-compliance`, breadcrumb reads "Home ›
    Quality & Compliance", both sub-tiles (Audit, Quality Assurance)
    render with distinct colors.
  - Clicking the Audit sub-tile lands on the real `/audit` (System Logs)
    page; clicking Quality Assurance lands on the real
    `/quality-assurance` page.
  - "← Back to Home" returns to `/`.
  - Screenshots confirm clean rendering, no loading-spinner artifacts.

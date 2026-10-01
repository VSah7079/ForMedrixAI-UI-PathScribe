# pages/BatchManagement/

Cassette/slide chain-of-custody through histology processing nodes, plus the three real, computed queues surfaced as their own tiles/pages alongside it — and, since a later session, a fourth tile of a genuinely different kind (a live device-status dashboard, not a computed "what needs attention" queue).

## Files

- **`BatchManagementPage.tsx`** — the main page: processing-node tiles (Decal/Special Processing, Processing, Embedding, Microtomy/Sectioning, Staining, Checkout), active batch list, and the tiles navigating to the four pages below. **Real, per direct UI-review follow-up ("Fix the root" — background inconsistency across pages):** `.ps-batch-page`'s own hardcoded `background: var(--ps-bg)` removed — falls through to `AppShell.tsx`'s own, real `.ps-app-root` background now (see that folder's own README for the fuller account of the inline-style bug this whole pass traced back to), matching Configuration/Quality Assurance/Intraop Queue/Contribution.
- **`BatchDetailView.tsx`** — a single batch's manifest, scan-to-add items.
- **`NewContainerModal.tsx`** — create a new batch (container type, target node, protocol/run parameters, priority, identifier mode disposable vs. reusable rack).
- **`DisposalQueuePage.tsx`** (`/batch-management/disposal`) — real, computed queue of every specimen/block/slide currently eligible for disposal under retention policy, with direct scan-to-dispose. Backed by `services/retentionPolicy/computeDisposalQueue.ts`.
- **`DisposalReportPage.tsx`** (`/batch-management/disposal-report`) — **Stain QC Module §2.5 (waste tracking/reporting)**. Read-only compliance report of every item that has genuinely already been disposed (the mirror image of `DisposalQueuePage.tsx` above — reports on the past action, never performs it), filterable by facility/material type/disposal date range, with XLSX export for CAP/CLIA/ISO 15189 audits. Backed by `services/retentionPolicy/computeDisposalReport.ts` — see that file's own header for the full account of what this closed vs. what already existed. i18n'd from the start (`disposalReport.*` keys, all five locales) per the standing rule — see `i18n/README.md`.
- **`PendingBatchQueuePage.tsx`** (`/batch-management/pending-load`) — real, computed queue of cassettes/slides printed/engraved but not yet scanned into any active batch, with live search/filter. Backed by `services/batches/computePendingBatchQueue.ts`.
- **`RetentionHoldsQueuePage.tsx`** (`/batch-management/retention-holds`) — real, computed queue of every case with an active retention hold, oldest-first, click-through to the case to release it there. Backed by `services/retentionPolicy/computeActiveRetentionHoldsQueue.ts`.
- **`EngraverMonitorPage.tsx`** (`/batch-management/engraver-monitor`) — a real, deliberately thin, read-only device-status surface for the Cassette Engine's own fleet, per a confirmed architectural verdict: PathScribe owns the "Clinical & Workflow Layer" (a coarse status summary), the Engine owns the "Hardware & Fleet Layer" (physical diagnostics, hopper topology, direct hardware controls) — never rebuilt here. KPI counts by status, a device card grid (status badge, real structured supply warnings with color names resolved via `mockCassetteColorService.ts`, a "Launch Engine Diagnostics" link when the Engine provides one), poll-based refresh (matching this app's own established convention — no `onSnapshot` listener anywhere in this codebase). Reads `services/engravers/fetchEngraverDevices.ts` — see that folder's own README, including its real, disclosed gap (no test file exists for it) and the fact that the underlying `engraver_devices` Firestore collection has never actually been reached by a real browser (client Firebase config is still placeholder).

## Notes

- The three queue pages are deliberately read-only/navigate — the real action (loading into a batch, disposing, releasing a hold) already lives elsewhere (`BatchDetailView`, the disposal scan action, `CaseHoldModal`/`RetentionHoldModal`), so these pages answer "what needs attention" without duplicating the action itself. `EngraverMonitorPage.tsx` is read-only for a different real reason — see its own entry above.
- None of the three queues are stored/cached — each is derived fresh from real case/batch data every time the page loads, so nothing here can silently drift from reality. `EngraverMonitorPage.tsx` is different again: it reads real, persisted Firestore state (`engraver_devices`) on a poll interval, not a fresh per-load computation — there's nothing to "derive," the Engine's own last-reported status *is* the real, current answer.

## Batch 367 (PS-74): no inline CSS

`BatchDetailView.tsx`, `BatchManagementPage.tsx`, `EngraverMonitorPage.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

## Batch 368

`BatchDetailView` and `EngraverMonitorPage` take `referralTrackingService` and `cassetteColorService` from `@/services`, and are off the deployment baseline.

## Batch 369

`DisposalReportPage.tsx` used the Quality Assurance export helper. It now calls `utils/csv.ts` directly, because the waste-tracking report isn't one of the QA report capabilities. Its export isn't gated yet; it's on the PS-357 sweep list.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

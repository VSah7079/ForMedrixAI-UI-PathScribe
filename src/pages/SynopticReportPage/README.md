# pages/SynopticReportPage/

The core clinical workflow page — a case's full report/material/sign-out experience, reached at `/case/:caseId/synoptic`.

## Files

- **`SynopticReportPage.tsx`** — layout and modal wiring only. Deliberately kept to that: business logic lives in `hooks/`, presentational pieces in `components/`, and every dialog in `modals/` — this file's own job is assembling those, not implementing them.

## Subfolders

- **`hooks/`** — ten domain hooks (LIS integration, specimen/block management, report generation, amendment workflow, grossing completion, orchestrator draft lifecycle, sign-out/finalize, microscopic entry, cassette scan verification, release-buffer countdown). See its own `README.md` for the full architecture and `hooks/__tests__/README.md` for the testing approach.
- **`components/`** — presentational pieces specific to this page (header, sidebar, material tree, banners, panels).
- **`modals/`** — every modal reachable from this page (23 files — sign-out, holds, specimen/block editors, amendment, team, printing, and more).

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

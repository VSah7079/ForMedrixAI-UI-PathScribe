# pages/SynopticReportPage/components/

Presentational and semi-presentational pieces specific to the case report page — real business logic lives in `../hooks/`, not here. 17 files.

## Layout & navigation

- **`HeaderBar.tsx`** — the rich case header: accession, patient info, progress steps.
- **`Sidebar.tsx`** — specimen list, case-level actions (Case Comment, Retention Hold, Case Hold), delegate/team/flags entry points.
- **`LeftReportPanel.tsx`** — left-hand report panel, wires in `InternalNotesDrawer`.
- **`RightSynopticPanel.tsx`** — the main synoptic-answering panel; required-field validation, AI suggestions, template resolution.
- **`OrchestratorSectionEditor.tsx`** — Orchestration mode's own right-hand narrative editor, deliberately mirroring `RightSynopticPanel`'s structure so a pathologist moving between modes doesn't need to relearn the UI.
- **`BottomActionBar.tsx`** — Previous/Next, Save, Finalize, and the rest of the persistent bottom action row.
- **`SequencerPanel.tsx`** — case sequencing/navigation panel.

## Material & specimens

- **`MaterialTreePanel.tsx`** — the Specimens/Blocks/Slides/Decants tree, including the Grossing Release panel and cassette color display.
- **`GrossingReleasePanel.tsx`** — real scan-triggered grossing release UI (grossing-scan → hydrate → release workflow).
- **`MicroscopicEntryPanel.tsx`** — simple microscopic-description entry step, filling a real gap in the Orchestration flow ("after gross complete, what's the next logical step?").
- **`BiopsyArrayDiagram.tsx`** — real, visual diagram for assigning each biopsy core to a specific section of a shared block, so a pathologist can always identify which section of the block a given core was embedded in.
- **`BillingReviewPanel.tsx`** — AI Billing Code Review tab: left tree (specimens/blocks with pending/applied-count badges), right detail panel (pending suggestions, applied codes, manual add), matching the Code Manager's own left-tree/right-detail interaction pattern. **Known gap, not yet fixed**: has no coverage for Biopsy Array cases — see `services/billing/README.md`'s own disclosure for why.
- **`AddSynopticModal.tsx`** — two-panel Flag-Manager-style modal for adding synoptic reports to a case.

## Amendment, release & status banners

- **`AmendmentDraftBanner.tsx`** — persistent Amendment Summary Box plus a live Changed Items Summary while an amendment/addendum is being drafted.
- **`AmendmentStatusBanner.tsx`** — one N-column version matrix per synoptic instance with released amendments (a case can have multiple, independently-amended reports).
- **`ReleaseBufferBanner.tsx`** — shown while a case is `pending-release`: live countdown to automatic release, with a real recall option for the signing pathologist (Post-Sign-Out Release Buffer).
- **`PendingReleaseWatermark.tsx`** — non-removable diagonal watermark on any PDF/browser/internal view of a case still in the release buffer window.

## Other

- **`MarkersPanel.tsx`** — resolved biomarker values grouped by marker (e.g. all ER-related fields — Status, % Positivity, Intensity — under one card).
- **`EMRSidecarDrawer.tsx`** — slide-in EMR sidecar drawer (replaces an earlier floating/draggable modal version, now matching the app's standard drawer convention).

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

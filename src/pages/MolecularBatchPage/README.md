# pages/MolecularBatchPage/

Real UI for the Full Molecular Testing Execution Module — see
`services/molecular/README.md` for the full, phase-by-phase architectural
account (21 real phases). This folder holds the plate builder and its
directly-adjacent workflow pages. The real, top-level worklist/tab
navigation itself now lives in `pages/MolecularWorkcenterPage/` (Phase 21,
per direct follow-up — see that folder's own README).

- **`MolecularPlateBuilderPage.tsx`** (`/molecular-batch/:batchId`) — the
  real, central page: batch creation, interactive plate/well grid
  (click-to-assign, barcode-scan-to-well, auto-fill row/column-major),
  reagent lot entry and live gating display, run-results view, the audit
  trail's own real "Trace" action, the real scan-verified worklist dispatch
  panel (Phase 9), and Clone & Supersede (Phase 20). Its own "Back to
  Batches" action resolves the real, correct Workcenter tab from the
  batch's own current status (`workcenterTabForStatus()`,
  `MolecularWorkcenterPage.tsx`), not a fixed default.
- **`MolecularRackWorklistPage.tsx`** / **`MolecularRackLoadingPage.tsx`**
  (`/molecular-rack`, `/molecular-rack/:rackId`) — Phase 10's own real
  extraction-rack workflow step: create a rack, scan specimens into real,
  linear positions, recording the real `primary_vial → secondary_rack`
  movement.
- **`MolecularControlRulesPage.tsx`** (`/molecular-control-rules`) —
  Phase 16's own real admin UI for Dynamic Control Rules/Position
  Enforcements (§3.2) — define which controls a given assay requires and
  whether each is fixed to a specific well or allowed anywhere.

**Real, direct correction (Phase 21)**: `MolecularBatchWorklistPage.tsx`
(the former worklist list at `/molecular-batch`) was deleted outright, not
left unrouted — fully superseded by `MolecularWorkcenterPage.tsx`'s own
real Worklist/Active/History tabs.

**Real, honest, flagged convention gap**: every page in this folder uses
inline `style={{...}}` throughout, not this app's own established
"no inline CSS, named classes only" convention for admin/Config-adjacent
UI (see `components/Config/System/README.md`'s own header, and
`src/README.md`'s own documented history of real bugs this exact pattern
has caused elsewhere). Found while auditing README coverage, not yet
reconciled — a real, later cleanup, not attempted here.

# Processing-node stage tiles, matching Worklist's own pattern

Per direct follow-up: "we could do something similar to the worklist
and have Tiles at the top. So you would have Grossing, Processing,
Embedding, Microtomy, Checkout - I may have missed some."

## The vocabulary — a real, deliberate reconciliation, not just a rename

The original feature spec's own processing-node wording ("Processor,
Embedding, Staining, Cover-slipping, Storage") was different from this
app's own, already-established real workflow-stage vocabulary
(ScanStation's own SCAN_STATION_WORKFLOW_STAGES: Accessioning ->
Grossing -> Processing -> Embedding -> Microtomy/Sectioning -> Staining
-> Slide Archival). Your own new list tracks that established
vocabulary closely. Aligned BATCH_PROCESSING_NODES to it — one real,
shared vocabulary for "what stage is this material at" across the
whole app, not two competing lists — while keeping Staining (a real,
distinct step, not dropped) and adding Checkout as the batch-specific
completion/reconciliation stage (the spec's own "Out-of-Process
Verification" step, genuinely new, not an existing stage renamed).
Final set: Grossing, Processing, Embedding, Microtomy, Staining,
Checkout.

## The tiles

Reused Worklist's own real, established .ps-wl-filter-tile styling
directly (WorklistPage.tsx) rather than inventing new tile CSS — same
real visual pattern (colored border/glow when active, real live count,
click to filter/toggle) users already know from that page. Each
tile's own count is real — active + reconciling batches currently at
that node, not a static or cached number.

## A real bug caught while testing this, not assumed away

Live-testing the tiles surfaced a genuine, pre-existing gap: after
creating a batch, dismissing the "Batch Created" confirmation via its
own "✕" (rather than "Continue — Scan Items") never refreshed the
parent page's own batch list — the batch was really created, but
invisible until a manual reload. Confirmed directly (not assumed) by
creating batches via that exact path and observing the list/tile
counts stay at zero. Fixed: "✕" on the success screen now also
notifies the parent, same as "Continue," since the batch already,
genuinely exists by that point regardless of which button dismisses
the confirmation.

## Verified

- npx tsc --noEmit -p . - clean
- Full test suite: 1093/1093 passing, zero regressions
- Live, real: created batches at different stages via the real UI
  (including the specific "✕" path that was broken), confirmed each
  tile's own count matches reality exactly (Embedding: 2, Staining:
  1), confirmed clicking a tile correctly narrows the list to only
  that stage's real batches and visually highlights the active tile.

## Changed files (4)
- src/services/batches/IBatchService.ts
- src/pages/BatchManagement/BatchManagementPage.tsx
- src/pages/BatchManagement/CreateBatchModal.tsx
- src/pathscribe.css

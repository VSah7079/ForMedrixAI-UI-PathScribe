# pages/BatchManagement/

Cassette/slide chain-of-custody through histology processing nodes, plus the three real, computed queues surfaced as their own tiles/pages alongside it.

## Files

- **`BatchManagementPage.tsx`** — the main page: processing-node tiles (Decal/Special Processing, Processing, Embedding, Microtomy/Sectioning, Staining, Checkout), active batch list, and the tiles navigating to the three queue pages below.
- **`BatchDetailView.tsx`** — a single batch's manifest, scan-to-add items.
- **`NewContainerModal.tsx`** — create a new batch (container type, target node, protocol/run parameters, priority, identifier mode disposable vs. reusable rack).
- **`DisposalQueuePage.tsx`** (`/batch-management/disposal`) — real, computed queue of every specimen/block/slide currently eligible for disposal under retention policy, with direct scan-to-dispose. Backed by `services/retentionPolicy/computeDisposalQueue.ts`.
- **`PendingBatchQueuePage.tsx`** (`/batch-management/pending-load`) — real, computed queue of cassettes/slides printed/engraved but not yet scanned into any active batch, with live search/filter. Backed by `services/batches/computePendingBatchQueue.ts`.
- **`RetentionHoldsQueuePage.tsx`** (`/batch-management/retention-holds`) — real, computed queue of every case with an active retention hold, oldest-first, click-through to the case to release it there. Backed by `services/retentionPolicy/computeActiveRetentionHoldsQueue.ts`.

## Notes

- All three queue pages are deliberately read-only/navigate — the real action (loading into a batch, disposing, releasing a hold) already lives elsewhere (`BatchDetailView`, the disposal scan action, `CaseHoldModal`/`RetentionHoldModal`), so these pages answer "what needs attention" without duplicating the action itself.
- None of the three queues are stored/cached — each is derived fresh from real case/batch data every time the page loads, so nothing here can silently drift from reality.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

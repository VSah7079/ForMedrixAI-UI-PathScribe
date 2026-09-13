# services/batches/

Container/batch chain-of-custody for cassettes and slides moving through downstream histology processing nodes (Decal/Special Processing, Processing, Embedding, Microtomy/Sectioning, Staining, Checkout) — real scan-based tracking, reconciliation, and QA discrepancy logging via container barcodes (`CONT-`/`RACK-` prefixes).

**Pattern:** Standard interface/mock pattern (`IBatchService.ts` / `mockBatchService.ts`), plus two real, computed-not-stored pieces layered on top.

## Files

- **`IBatchService.ts`** — the contract: `Batch`, `BatchItem`, `BatchProcessingNode`, the six real node names, and the disposable-container-vs-semi-permanent-rack identifier modes.
- **`mockBatchService.ts`** — the real, active implementation. `addItemByScan()` is the only way a `Batch.items[]` array ever grows — there is no pre-population of "expected" items before a real scan happens.
- **`DecalBatch.ts`** — decalcification-specific batch fields (acid type, target duration, alert timer) layered onto the base `Batch` shape for the Decal/Special Processing node.
- **`referralDestinationFacilityId`/`referralTestRequested`** (on `Batch` itself, `IBatchService.ts`) — real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-Laboratory Specimen Referral gap ("review the Batch operations as this is the logical place to host this functionality"). A seventh `BatchProcessingNode`, `'External Referral'`, reuses this same real scan/manifest/reconciliation architecture for an outgoing referral to an external reference lab — genuinely the same real shape as every internal processing node, just with a real `Facility` (carrying the new `reference_lab` role, `services/facilities/`) as the destination instead of an internal station. `dispatchReferralIfApplicable()`, called from both real completion paths (`completeReconciliation`, `overrideAndComplete`), automatically enqueues the real outbound manifest and creates a tracking record the moment a referral batch genuinely completes — see `services/referral/README.md` for the rest of that real, separate module.
- **`coldChainExcursion`** (on `Batch`, `IBatchService.ts`) — real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference Laboratory Sensor & Cold-Chain Integration gap. Gates `completeReconciliation()` the same real, hard-stop-with-supervisor-override way missing/unexpected items already do — set by `processInboundTelemetryReadingEvent.ts` (`services/coldChain/`) the moment a genuine temperature excursion is detected on a smart `HardwareContainer` currently checked out to this batch; cleared only by a real, explicit `acknowledgeColdChainExcursion()` call, never silently or merely because a later reading came back normal. See `services/coldChain/README.md` for the full account.
- **`computePendingBatchQueue.ts`** (+ `.test.ts`) — real, computed queue: every block/slide that physically exists (`Grossed`/`Embedded`/`Exhausted` status) but whose own `displayId` doesn't appear in any active batch's manifest yet. Deliberately unscoped by facility — a freshly printed cassette has no `locationHistory` yet, so there's no real location signal to scope by. Surfaced at `/batch-management/pending-load`.

## Notes

- Retention/disposal does **not** run through this batch/container model at all — see `services/retentionPolicy/README.md`. Disposal is a genuinely different workflow (a computed, scan-to-act queue, not a manually-created batch).
- `computePendingBatchQueue.ts` follows the same "derive fresh every time, never a separately stored, driftable copy" discipline as `computeActiveRetentionHoldsQueue.ts` and `computeDisposalQueue.ts` in `retentionPolicy/`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

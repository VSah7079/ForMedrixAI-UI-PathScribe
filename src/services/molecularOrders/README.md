# services/molecularOrders/

**NEW (Sep 2026)** — Protocol-Driven Workflow Infrastructure story, Part 2b. Real outbound queue for two genuinely distinct events: `'order.molecular'` (a real assay order — HPV co-test, HPV reflex genotyping) and `'order.instrument'` (a processing order to the ThinPrep processor at cytology batch creation). Deliberately separate from `services/accessioning/`'s own accession outbound queue — a different real concern (ordering an assay / notifying an instrument) — but follows its exact same established shape.

**Pattern:** Standard interface/mock pattern (`IMolecularOrderOutboundQueueService.ts` / `mockMolecularOrderOutboundQueueService.ts`), same real queue/retry/audit discipline as every other outbound queue in this app (`storageGet`/`storageSet`, `QUEUED`/`SENT`/`FAILED`, `DISPATCH_TIMEOUT`/`DISPATCH_UNREACHABLE`/`DISPATCH_REJECTED`).

## Files

- **`IMolecularOrderOutboundQueueService.ts`** / **`mockMolecularOrderOutboundQueueService.ts`** — the queue itself.

## The three real triggers that enqueue onto this queue

1. **Accession trigger** (`pages/AccessionPage/AccessionPage.tsx`, right after `caseRouter.createCase`) — reads `PathwayTask.sendOutboundOrder` for each specimen's own assigned protocol (`utils/resolveOutboundMolecularAssaysForProtocol.ts`, pure/tested) and enqueues an `'order.molecular'` entry (`orderReason: 'protocol_configured'`) per flagged assay. This is how the HPV co-test fires automatically for a ThinPrep specimen whose protocol has `st-hpv-reflex` (or the standalone `st-hpv-highrisk-screen`) configured with `sendOutboundOrder: true` on its `PathwayTask` — no separate HPV configuration service needed.
2. **Reflex trigger** (`services/hl7/processInboundHpvResultEvent.ts`) — when an inbound result is genuinely Positive and `HpvResultEventPayload.assayStainTypeId` was the standalone `st-hpv-highrisk-screen` (not the bundled `st-hpv-reflex`, which already implies its own reflex), enqueues an `'order.molecular'` entry for `st-hpv-genotyping` (`orderReason: 'hpv_reflex_genotyping'`, `reflexFromMessageId` tracing back to the original result's `messageId`). Closes the documented gap in `st-hpv-reflex`'s own Stain Dictionary description.
3. **Instrument trigger** (`services/batches/mockBatchService.ts`, `create()`) — at the moment a `'Cytology Processing'` batch is created, enqueues an `'order.instrument'` entry (`InstrumentOrderPayload`, keyed on `Batch.masterBarcode`) for the Hologic processor.

## Notes

- **`pages/MolecularOrderQueuePage/`** — **New (Sep 2026)**, per direct request: "we need to simulate or at least be able to demo our orders and inbound results for HPV testing." Confirmed directly first: none of this app's real outbound queues (accession, referral, cytology registry, this one) had any viewer UI at all before this. Scoped to what was actually asked for, not a generic queue-management system for every queue type. Routed at `/molecular-order-queue`, with a Home page tile. The demo panel operates against a real, already-existing seed case (`S26-5003-CYT-001`, Specimen A — already seeded with `cytologyScreening.hpvResult: 'Pending'`), never a synthetic case built from scratch: "Queue HPV co-test order" enqueues a real `order.molecular` entry via this folder's own `enqueue()`; "Simulate inbound HPV result" calls the real `processInboundHpvResultEvent()` directly — the same function a real interface engine's inbound HL7 ORU would call, never a separate demo-only code path. A Positive result against the standalone `st-hpv-highrisk-screen` assay visibly fires the real reflex genotyping order into the same table.

- `MolecularOrderPayload` vs `InstrumentOrderPayload` are a real discriminated union on `eventType` — `caseId` is undefined for an `'order.instrument'` entry, since a processor run is a real, physical batch of vials, not a single case (same real reasoning as `services/batches/`'s own `BatchItem` design).
- All three triggers are fire-and-forget (`.catch(console.error)`) — a real queueing failure here must never block accessioning, result ingestion, or batch creation from succeeding.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

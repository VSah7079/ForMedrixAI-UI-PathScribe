# types/printing/

PathScribe-owned internal event contract for real network printing — sending a print job to a real Interface Engine and receiving its callback status.

## Files

- **`NetworkPrintPayload.ts`** — the payload/callback shapes, per PS-51's own spec (Sections 5 "Network Print Payload Specification" and 7 "Callback Status Specification").
  - **Batch 347 (PS-54):** `labelData.labelType` (`CASSETTE` / `SLIDE`; absent means cassette), `labelData.slide` (`level`, `stainName`), and `attempt` (1, then 2, 3… on a retry, with the same `idempotencyKey`). The callback reaches the browser as a `PrintJobStatus` live-update event (`services/liveUpdates/liveUpdateContract.ts`; spec §10 of `docs/architecture/LIVE_UPDATES_SIGNALR.md`).

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*

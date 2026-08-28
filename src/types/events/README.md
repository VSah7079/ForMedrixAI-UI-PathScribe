# types/events/

PathScribe-owned internal event contracts for the LIS/middleware integration seam — deliberately vendor-agnostic (no Vantage/Cerebro/Mirth/Cloverleaf specifics live here; see `services/hl7/adapters/` for that). Split by direction: PathScribe publishes what happened in its own system, and separately ingests what local lab middleware reports back.

## Files

- **`ModeAOrderPayload.ts`** — outbound: label/order dispatch ("Mode A").
- **`MaterialScanEventPayload.ts`** — outbound: real-time tracking events as PathScribe's own material gets scanned, so PathScribe can participate in tracking rather than only ever receiving updates.
- **`BlockExceptionEventPayload.ts`** — inbound: receiving block exception status (Lost/Damaged) from local lab middleware.
- **`MaterialLocationEventPayload.ts`** — inbound: receiving material location/workflow-stage updates from local lab middleware.
- **`CassetteDispatchOutcomeEventPayload.ts`** — inbound: receiving the real outcome of a cassette color/hopper dispatch (dispatched / fallback used / prompted / error) from the Cassette Engine, so PathScribe can surface a real notification rather than silently assuming its own routing rule was honored.
- **`EngraverStatusEventPayload.ts`** — inbound: receiving high-level engraver/fleet device status (online / engraving / warning / fault / offline) from the Cassette Engine. Deliberately excludes raw hardware telemetry (hopper fill percentages, laser hours, temperature) — that stays the Engine's own "Hardware & Fleet Layer," per the confirmed Engraver Monitor architectural boundary. Real, per direct guidance's own explicit correction: even the *supply* status is structured, not raw telemetry — `supplyWarnings` is a closed set of real functional states (`CASSETTE_SUPPLY_LOW`/`CASSETTE_SUPPLY_DEPLETED`/`COLOR_UNAVAILABLE`), each optionally tied to a real `CassetteColorDefinition.key`, never a per-hopper fill percentage. `warnings` (free text) is kept separately for non-supply operational issues (e.g. "Cover Open") that aren't a small, closed set worth a real enum.

## Notes

- Each inbound payload has a corresponding `process<X>Event.ts` ingestion function in `services/hl7/` — same idempotent-on-`messageId` pattern across all of them — **except `EngraverStatusEventPayload.ts`**, which is device-scoped rather than case-scoped and has no frontend "Sim" trigger or `process*Event.ts` counterpart at all; it's ingested entirely backend-side (`api/webhooks/engine/engraver-status.ts` + `upsertEngraverStatus.ts` — see that folder's own README).

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*

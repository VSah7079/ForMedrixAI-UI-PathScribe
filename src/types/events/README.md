# types/events/

PathScribe-owned internal event contracts for the LIS/middleware integration seam — deliberately vendor-agnostic (no Vantage/Cerebro/Mirth/Cloverleaf specifics live here; see `services/hl7/adapters/` for that). Split by direction: PathScribe publishes what happened in its own system, and separately ingests what local lab middleware reports back.

## Files

- **`ModeAOrderPayload.ts`** — outbound: label/order dispatch ("Mode A").
- **`MaterialScanEventPayload.ts`** — outbound: real-time tracking events as PathScribe's own material gets scanned, so PathScribe can participate in tracking rather than only ever receiving updates.
- **`BlockExceptionEventPayload.ts`** — inbound: receiving block exception status (Lost/Damaged) from local lab middleware.
- **`MaterialLocationEventPayload.ts`** — inbound: receiving material location/workflow-stage updates from local lab middleware.
- **`CassetteDispatchOutcomeEventPayload.ts`** — inbound: receiving the real outcome of a cassette color/hopper dispatch (dispatched / fallback used / prompted / error) from the Cassette Engine, so PathScribe can surface a real notification rather than silently assuming its own routing rule was honored.

## Notes

- Each inbound payload has a corresponding `process<X>Event.ts` ingestion function in `services/hl7/` — same idempotent-on-`messageId` pattern across all of them.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*

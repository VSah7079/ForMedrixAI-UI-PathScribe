# services/coldChain/

Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
Laboratory Sensor & Cold-Chain Integration gap: "Direct ingestion of
telemetry data (temperature, humidity, GPS) from smart transport
containers and storage equipment via IoT/MQTT/REST APIs... Automated
Excursion Alerts: System alerts and workflow hold triggers if transit
temperature exceeds defined parameters."

## Files

- **`IStorageConditionTypeService.ts` / `mockStorageConditionTypeService.ts`**
  — a real, admin-editable dictionary of temperature thresholds.
  Seeded with the RFP's own two stated examples verbatim (Frozen
  Tissue: max -20°C; Fresh Tissue: max 8°C), not invented values, but
  genuinely admin-configurable beyond those two.
- **`IStorageUnitService.ts` / `mockStorageUnitService.ts`** — the
  RFP's own "storage equipment" (freezers, refrigerators): fixed,
  stationary equipment that never moves between benches and is never
  checked out to a Batch — confirmed directly that nothing resembling
  this existed anywhere in this app before building it.
- **`ITelemetryReadingService.ts` / `mockTelemetryReadingService.ts`**
  — one real, shared reading shape covering both real monitored asset
  types this gap names (a smart `HardwareContainer` or a
  `StorageUnit`), rather than two, near-duplicate reading types.
  Resolves the real asset's own assigned `StorageConditionType` and
  calls `resolveColdChainExcursion.ts`'s own real logic to classify
  the reading at record time — never recomputed later, so a reading's
  own historical excursion status stays honest even if a threshold is
  later edited.
- **`resolveColdChainExcursion.ts`** — the real, pure, fully-tested
  excursion rule (7 tests). A reading exactly at a threshold is not
  itself a violation; strictly above (or, when a real minimum is also
  set, strictly below) is.
- **`processInboundTelemetryReadingEvent.ts`** — real, idempotent
  ingestion. On a genuine excursion, ties together every other real
  piece this gap needed: sets the real workflow hold on whichever
  active `Batch` the container is currently checked out to
  (`services/batches/`), and raises one real, `open` CAPA deficiency
  (`def-cold-chain-excursion`, `services/deficiencies/`) per distinct
  real case actually represented in that batch's own items.

## Real, honest scope

A workflow hold and a case-scoped deficiency both require a real,
active `Batch` with real items to attach to — genuinely only possible
for a smart `HardwareContainer` currently checked out to one. A
`StorageUnit` excursion, or a smart container with no currently-active
batch, is a real, genuine equipment/facility-level issue with no
single real case to raise a deficiency against — surfaced only via
the reading's own `isExcursion` flag, never a fabricated case
association.

Same "PathScribe ingests its own specification; a real interface
engine handles the actual IoT/MQTT/REST transport" split as
everywhere else in this app — filed on the RFP-APLIS-2026-GLOBAL
Backend Needs Log: a real MQTT/IoT ingestion endpoint and a
persistent telemetry store, tracked by the backend team's own
stories, not built here.

## Real extensions to two existing folders, not new parallel entities

- `services/hardwareContainers/`: `HardwareContainer` gained
  `isSmartContainer`/`storageConditionTypeId` — most real racks are
  not smart-sensored, so both stay `undefined` for the vast majority
  of real containers. `create()`'s own draft type and a new,
  previously-missing `update()` method were extended/added so an
  admin can actually set these, at creation or retroactively.
- `services/batches/`: `Batch` gained `coldChainExcursion`, gating
  `completeReconciliation()` the same real way missing/unexpected
  items already do — `overrideAndComplete()` remains the same, real
  supervisor escape hatch. `setColdChainExcursion()`/
  `acknowledgeColdChainExcursion()` added to `IBatchService.ts`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

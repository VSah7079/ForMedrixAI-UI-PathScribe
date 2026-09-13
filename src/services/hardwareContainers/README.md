# services/hardwareContainers/

Registry of semi-permanent, laser-engraved, reusable hardware containers (racks/baskets/trays) — their check-in/check-out lifecycle against `services/batches/` sessions (Available / In Use), so the same physical rack can't be double-assigned to two active batches.

**Pattern:** Standard interface/mock pattern (no firestore stub currently).

## Files

- **`IHardwareContainerRegistryService.ts`** — the contract: `HardwareContainer` (rack ID, status, current batch link).
- **`mockHardwareContainerRegistryService.ts`** — the real, active implementation.

## Notes

- Deliberately a separate registry from `services/scanStations/`, despite both being admin-managed physical-hardware records — a scan station is *where* a tech works (a fixed bench/terminal); a hardware container is *what* a tech works *with* (a reusable rack that moves between benches and gets checked in/out of active batches). Conflating them would force one entity's real fields onto the other.
- Only semi-permanent containers (Mode B — laser-engraved, reusable rack IDs) get a record here. Disposable containers (Mode A — a single-use, timestamped `CONT-` label) are deliberately not tracked as hardware at all — a disposable label has no physical re-use lifecycle to register.
- **`isSmartContainer`/`storageConditionTypeId`** — real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference Laboratory Sensor & Cold-Chain Integration gap ("smart transport containers"). Most real racks are not smart-sensored, so both stay `undefined` for the vast majority of real containers. `create()`'s own draft type and a new, previously-missing `update()` method were extended/added so an admin can actually set these, at creation or retroactively — see `services/coldChain/README.md` for the full account of what reads these fields (`processInboundTelemetryReadingEvent.ts`, resolving which real threshold a container's own telemetry should be checked against).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

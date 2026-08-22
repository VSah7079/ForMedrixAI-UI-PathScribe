# services/hardwareContainers/

Registry of semi-permanent, laser-engraved, reusable hardware containers (racks/baskets/trays) — their check-in/check-out lifecycle against `services/batches/` sessions (Available / In Use), so the same physical rack can't be double-assigned to two active batches.

**Pattern:** Standard interface/mock pattern (no firestore stub currently).

## Files

- **`IHardwareContainerRegistryService.ts`** — the contract: `HardwareContainer` (rack ID, status, current batch link).
- **`mockHardwareContainerRegistryService.ts`** — the real, active implementation.

## Notes

- Deliberately a separate registry from `services/scanStations/`, despite both being admin-managed physical-hardware records — a scan station is *where* a tech works (a fixed bench/terminal); a hardware container is *what* a tech works *with* (a reusable rack that moves between benches and gets checked in/out of active batches). Conflating them would force one entity's real fields onto the other.
- Only semi-permanent containers (Mode B — laser-engraved, reusable rack IDs) get a record here. Disposable containers (Mode A — a single-use, timestamped `CONT-` label) are deliberately not tracked as hardware at all — a disposable label has no physical re-use lifecycle to register.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

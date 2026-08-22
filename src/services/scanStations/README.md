# services/scanStations/

Registry of physical scan/work stations — where a tech actually scans a specimen at the bench — facility-scoped, with an Active/Inactive/Unverified lifecycle and a real workflow-stage mapping. A genuinely different real entity from `services/locations/` (which tracks where a *patient* is physically placed, ward/room/bed, HL7 PV1) and from `services/hardwareContainers/` (a reusable rack that moves between stations, not a fixed station itself).

**Pattern:** Standard interface/mock pattern (no firestore stub currently), same established shape as `services/locations/`.

## Files

- **`IScanStationService.ts`** — the contract: `ScanStation` (barcode code for `STATION:`-prefix switching, `workflowStage`, `facilityId`, lifecycle status).
- **`mockScanStationService.ts`** — the real, active implementation.
- **`validateScanStationDraft.ts`** (+ `.test.ts`) — real, pure validation for the admin add/edit form.

## Notes

- The current effective scan station drives real, downstream behavior throughout the app (material scan tracking, print routing, cassette color resolution context) — see `hooks/useEffectiveScanStation.ts` and `hooks/useCurrentScanStation.ts` for how a station gets resolved and threaded through.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
